"""Deploy the reviewed app/CV containers without publishing local credential files."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from dotenv import load_dotenv, set_key

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
load_dotenv('.env.local')
region = os.getenv('AWS_REGION', 'ap-southeast-2')
session = boto3.Session(region_name=region)
config = Config(connect_timeout=5, read_timeout=30, retries={'max_attempts': 2})
state_file = ROOT / '.cache/deployment/state.json'
images_file = ROOT / '.cache/deployment/images.json'
stack_name = 'floodflow-live'


def client(name):
    return session.client(name, config=config)


def prepare():
    ecr, sm = client('ecr'), client('secretsmanager')
    state = {'region': region, 'stack': stack_name}
    for name in ['floodflow-web', 'floodflow-cv']:
        try:
            repository = ecr.describe_repositories(repositoryNames=[name])['repositories'][0]
        except ecr.exceptions.RepositoryNotFoundException:
            repository = ecr.create_repository(repositoryName=name, imageTagMutability='IMMUTABLE', imageScanningConfiguration={'scanOnPush': True})['repository']
        state[name] = repository['repositoryUri']
    name = 'floodflow/deployment/runtime'
    try:
        existing = sm.get_secret_value(SecretId=name)
        settings = json.loads(existing['SecretString'])
        state['secretArn'] = existing['ARN']
    except sm.exceptions.ResourceNotFoundException:
        settings = {}
    import secrets
    settings['CV_SERVICE_TOKEN'] = settings.get('CV_SERVICE_TOKEN') or secrets.token_urlsafe(48)
    settings['ORIGIN_TOKEN'] = settings.get('ORIGIN_TOKEN') or secrets.token_urlsafe(48)
    defaults = {'DEEPGRAM_API_KEY':'', 'S3_EVIDENCE_BUCKET':'', 'S3_REGION':region,
        'POLLY_VOICE_ID':'Kajal', 'POLLY_SPEECH_RATE':'125',
        'BEDROCK_VISION_MODEL_ID':'amazon.nova-lite-v1:0', 'BEDROCK_RECOMMENDATION_MODEL_ID':'amazon.nova-lite-v1:0',
        'GOOGLE_STREETVIEW_API_KEY':''}
    for name in ['reports', 'reports_archive', 'accounts', 'sessions', 'garage', 'analyses']:
        defaults['DYNAMODB_'+name.upper()+'_TABLE'] = 'floodflow_'+name
    for key, default in defaults.items():
        settings[key] = os.getenv(key, settings.get(key, default))
    if not settings['S3_EVIDENCE_BUCKET']:
        raise SystemExit('Configure S3_EVIDENCE_BUCKET before deployment')
    if 'secretArn' in state:
        sm.put_secret_value(SecretId=state['secretArn'], SecretString=json.dumps(settings))
    else:
        state['secretArn'] = sm.create_secret(Name='floodflow/deployment/runtime', SecretString=json.dumps(settings))['ARN']
    state['tableArns'] = []
    for key, table in settings.items():
        if key.startswith('DYNAMODB_'):
            arn = client('dynamodb').describe_table(TableName=table)['Table']['TableArn']
            state['tableArns'] += [arn, arn+'/index/*']
    state['prefixList'] = client('ec2').describe_managed_prefix_lists(Filters=[{'Name':'prefix-list-name','Values':['com.amazonaws.global.cloudfront.origin-facing']}])['PrefixLists'][0]['PrefixListId']
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(json.dumps(state, indent=2)); state_file.chmod(0o600)
    for key, value in {'ECS_STACK_NAME':stack_name, 'ECS_REGION':region, 'ECS_CPU':'2048', 'ECS_MEMORY':'8192',
        'ECS_SERVICE_TOKEN_SECRET_ARN':state['secretArn'], 'CV_SERVICE_TOKEN':settings['CV_SERVICE_TOKEN'],
        'ECS_WEB_ECR_REPOSITORY':state['floodflow-web'], 'ECS_CV_ECR_REPOSITORY':state['floodflow-cv']}.items():
        set_key('env.cache', key, value, quote_mode='never')
    Path('env.cache').chmod(0o600)
    print('ECR repositories and runtime secret ready. Existing data services preserved.', flush=True)


def publish():
    state = json.loads(state_file.read_text())
    authorization = client('ecr').get_authorization_token()['authorizationData'][0]
    username, password = base64.b64decode(authorization['authorizationToken']).decode().split(':',1)
    subprocess.run(['docker','login','--username',username,'--password-stdin',authorization['proxyEndpoint']],input=password.encode(),check=True)
    tag = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    images = {}
    for name in ['web', 'cv']:
        image = state['floodflow-'+name]+':'+tag
        subprocess.run(['docker','tag','floodflow-'+name+':deploy',image],check=True)
        subprocess.run(['docker','push',image],check=True)
        images[name] = image
    images_file.write_text(json.dumps(images,indent=2))
    for name, image in images.items():
        set_key('env.cache','ECS_'+name.upper()+'_IMAGE_URI',image,quote_mode='never')
    print('Both reviewed images published.',flush=True)


def deploy():
    state = json.loads(state_file.read_text()); images = json.loads(images_file.read_text())
    subprocess.run([sys.executable,'infra/deployment/build_template.py'],check=True)
    template = Path('infra/deployment/stack.json').read_text()
    cf = client('cloudformation');cf.validate_template(TemplateBody=template)
    settings = json.loads(client('secretsmanager').get_secret_value(SecretId=state['secretArn'])['SecretString'])
    params = {'WebImage':images['web'],'CvImage':images['cv'],'RuntimeSecretArn':state['secretArn'],
        'EvidenceBucket':settings['S3_EVIDENCE_BUCKET'],'TableArns':','.join(state['tableArns']),
        'CloudFrontPrefixList':state['prefixList'],'OriginToken':settings['ORIGIN_TOKEN']}
    arguments = {'StackName':stack_name,'TemplateBody':template,'Parameters':[{'ParameterKey':k,'ParameterValue':v} for k,v in params.items()],
        'Capabilities':['CAPABILITY_IAM'],'Tags':[{'Key':'Project','Value':'FloodFlow'},{'Key':'Purpose','Value':'hackathon'}]}
    try:
        stacks = cf.describe_stacks(StackName=stack_name)['Stacks']
        st = stacks[0]['StackStatus']
        if st in ['ROLLBACK_COMPLETE', 'ROLLBACK_FAILED', 'ROLLBACK_IN_PROGRESS']:
            print(f'Stack is in {st}. Cleaning up before recreation...', flush=True)
            if st == 'ROLLBACK_IN_PROGRESS':
                try:
                    cf.get_waiter('stack_rollback_complete').wait(StackName=stack_name)
                except Exception:
                    pass
            cf.delete_stack(StackName=stack_name)
            cf.get_waiter('stack_delete_complete').wait(StackName=stack_name)
            cf.create_stack(**arguments)
            print('Stack creation started cleanly.', flush=True)
            return
    except cf.exceptions.ClientError as error:
        if 'does not exist' not in str(error):raise
        cf.create_stack(**arguments)
        print('Stack creation started.',flush=True)
    else:
        try:cf.update_stack(**arguments);print('Stack update started.',flush=True)
        except cf.exceptions.ClientError as error:
            if 'No updates are to be performed' not in str(error):raise
            print('Stack already matches configuration.',flush=True)


def status():
    cf=client('cloudformation');stack=cf.describe_stacks(StackName=stack_name)['Stacks'][0]
    print(stack['StackStatus'],flush=True)
    events=cf.describe_stack_events(StackName=stack_name)['StackEvents']
    for event in events[:12]:
        if 'FAILED' in event['ResourceStatus']:
            print(event['LogicalResourceId'],event['ResourceStatusReason'],flush=True)
    if stack['StackStatus'] in ['CREATE_COMPLETE','UPDATE_COMPLETE']:
        outputs={item['OutputKey']:item['OutputValue'] for item in stack.get('Outputs',[])}
        for key,output in [('CV_SERVICE_URL','CvUrl'),('ECS_LIVE_URL','LiveUrl'),('ECS_CLUSTER_NAME','ClusterName'),('ECS_FILE_SYSTEM_ID','FilesystemId'),('ECS_CLOUDFRONT_DISTRIBUTION_ID','DistributionId')]:
            if output in outputs:set_key('env.cache',key,outputs[output],quote_mode='never')
        print(outputs.get('LiveUrl',''),flush=True)


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['prepare','publish','deploy','status'])
    args=parser.parse_args()
    {'prepare':prepare,'publish':publish,'deploy':deploy,'status':status}[args.action]()
