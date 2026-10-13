"""Build a reviewable CloudFormation stack; existing S3/DynamoDB stay external."""
import json
from pathlib import Path

ref = lambda name: {"Ref": name}
sub = lambda text: {"Fn::Sub": text}
attr = lambda name, key: {"Fn::GetAtt": [name, key]}
r = {}
def resource(name, kind, properties, **extras):
    r[name] = {"Type": kind, "Properties": properties, **extras}

resource("Vpc", "AWS::EC2::VPC", {"CidrBlock": "10.67.0.0/16", "EnableDnsSupport": True, "EnableDnsHostnames": True})
resource("Gateway", "AWS::EC2::InternetGateway", {})
resource("GatewayAttachment", "AWS::EC2::VPCGatewayAttachment", {"VpcId": ref("Vpc"), "InternetGatewayId": ref("Gateway")})
resource("RouteTable", "AWS::EC2::RouteTable", {"VpcId": ref("Vpc")})
resource("InternetRoute", "AWS::EC2::Route", {"RouteTableId": ref("RouteTable"), "DestinationCidrBlock": "0.0.0.0/0", "GatewayId": ref("Gateway")}, DependsOn="GatewayAttachment")
for i in range(2):
    resource(f"Subnet{i}", "AWS::EC2::Subnet", {"VpcId": ref("Vpc"), "CidrBlock": f"10.67.{i}.0/24", "AvailabilityZone": {"Fn::Select": [i, {"Fn::GetAZs": ""}]}})
    resource(f"SubnetRoute{i}", "AWS::EC2::SubnetRouteTableAssociation", {"SubnetId": ref(f"Subnet{i}"), "RouteTableId": ref("RouteTable")})
subnets = [ref("Subnet0"), ref("Subnet1")]
resource("AlbSecurity", "AWS::EC2::SecurityGroup", {"GroupDescription": "CloudFront origin traffic only", "VpcId": ref("Vpc"), "SecurityGroupIngress": [{"IpProtocol": "tcp", "FromPort": 80, "ToPort": 80, "SourcePrefixListId": ref("CloudFrontPrefixList")} ]})
resource("TaskSecurity", "AWS::EC2::SecurityGroup", {"GroupDescription": "Web and CV ports from ALB only", "VpcId": ref("Vpc"), "SecurityGroupIngress": [{"IpProtocol":"tcp","FromPort":port,"ToPort":port,"SourceSecurityGroupId":ref("AlbSecurity")} for port in [3000,8080]]})
resource("EfsSecurity", "AWS::EC2::SecurityGroup", {"GroupDescription": "Persistent app state from task only", "VpcId": ref("Vpc"), "SecurityGroupIngress": [{"IpProtocol":"tcp","FromPort":2049,"ToPort":2049,"SourceSecurityGroupId":ref("TaskSecurity")}]})
resource("Filesystem", "AWS::EFS::FileSystem", {"Encrypted": True, "PerformanceMode": "generalPurpose", "LifecyclePolicies": [{"TransitionToIA": "AFTER_30_DAYS"}]}, DeletionPolicy="Retain", UpdateReplacePolicy="Retain")
resource("AccessPoint", "AWS::EFS::AccessPoint", {"FileSystemId": ref("Filesystem"), "PosixUser": {"Uid":"10001","Gid":"10001"}, "RootDirectory": {"Path":"/floodflow", "CreationInfo":{"OwnerUid":"10001","OwnerGid":"10001","Permissions":"0700"}}})
for i in range(2):
    resource(f"Mount{i}", "AWS::EFS::MountTarget", {"FileSystemId":ref("Filesystem"),"SubnetId":ref(f"Subnet{i}"),"SecurityGroups":[ref("EfsSecurity")]})
trust = {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
resource("ExecutionRole","AWS::IAM::Role",{"AssumeRolePolicyDocument":trust,"ManagedPolicyArns":["arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"],"Policies":[{"PolicyName":"RuntimeSecrets","PolicyDocument":{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"secretsmanager:GetSecretValue","Resource":ref("RuntimeSecretArn")}]}}]})
resource("TaskRole","AWS::IAM::Role",{"AssumeRolePolicyDocument":trust,"Policies":[{"PolicyName":"FloodFlowRuntime","PolicyDocument":{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan","dynamodb:BatchGetItem","dynamodb:BatchWriteItem"],"Resource":ref("TableArns")},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":sub("arn:aws:s3:::${EvidenceBucket}/*")},
 {"Effect":"Allow","Action":["s3:GetBucketLocation"],"Resource":sub("arn:aws:s3:::${EvidenceBucket}")},
 {"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],"Resource":sub("arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-lite-v1:0")},
 {"Effect":"Allow","Action":["polly:SynthesizeSpeech","polly:DescribeVoices"],"Resource":"*"},
 {"Effect":"Allow","Action":["elasticfilesystem:ClientMount","elasticfilesystem:ClientWrite"],"Resource":attr("Filesystem","Arn"),"Condition":{"StringEquals":{"elasticfilesystem:AccessPointArn":attr("AccessPoint","Arn")}}}
]}}]})
resource("Cluster","AWS::ECS::Cluster",{"ClusterName":sub("${AWS::StackName}")})
resource("Logs","AWS::Logs::LogGroup",{"LogGroupName":sub("/ecs/${AWS::StackName}"),"RetentionInDays":7})
resource("Alb","AWS::ElasticLoadBalancingV2::LoadBalancer",{"Scheme":"internet-facing","Type":"application","Subnets":subnets,"SecurityGroups":[ref("AlbSecurity")],"LoadBalancerAttributes":[{"Key":"idle_timeout.timeout_seconds","Value":"240"}]})
for name,port,health in [("Web",3000,"/api/health"),("Cv",8080,"/health")]:
    resource(name+"Target","AWS::ElasticLoadBalancingV2::TargetGroup",{"VpcId":ref("Vpc"),"Port":port,"Protocol":"HTTP","TargetType":"ip","HealthCheckPath":health,"HealthCheckIntervalSeconds":30,"HealthCheckTimeoutSeconds":10,"TargetGroupAttributes":[{"Key":"deregistration_delay.timeout_seconds","Value":"180"}]})
resource("Listener","AWS::ElasticLoadBalancingV2::Listener",{"LoadBalancerArn":ref("Alb"),"Port":80,"Protocol":"HTTP","DefaultActions":[{"Type":"fixed-response","FixedResponseConfig":{"StatusCode":"403","ContentType":"text/plain","MessageBody":"Use the HTTPS endpoint"}}]})
origin_condition={"Field":"http-header","HttpHeaderConfig":{"HttpHeaderName":"X-Floodflow-Origin","Values":[ref("OriginToken")]}}
for name,priority,conditions in [("Cv",10,[origin_condition,{"Field":"path-pattern","PathPatternConfig":{"Values":["/analyze","/health"]}}]),("Web",20,[origin_condition])]:
    resource(name+"Rule","AWS::ElasticLoadBalancingV2::ListenerRule",{"ListenerArn":ref("Listener"),"Priority":priority,"Conditions":conditions,"Actions":[{"Type":"forward","TargetGroupArn":ref(name+"Target")}]})
resource("Distribution","AWS::CloudFront::Distribution",{"DistributionConfig":{"Enabled":True,"Comment":"FloodFlow full app and CV","PriceClass":"PriceClass_100","Origins":[{"Id":"app-alb","DomainName":attr("Alb","DNSName"),"CustomOriginConfig":{"HTTPPort":80,"HTTPSPort":443,"OriginProtocolPolicy":"http-only","OriginReadTimeout":60},"OriginCustomHeaders":[{"HeaderName":"X-Floodflow-Origin","HeaderValue":ref("OriginToken")}]}],"DefaultCacheBehavior":{"TargetOriginId":"app-alb","ViewerProtocolPolicy":"redirect-to-https","AllowedMethods":["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],"CachedMethods":["GET","HEAD"],"CachePolicyId":"4135ea2d-6df8-44a3-9df3-4b5a84be39ad","OriginRequestPolicyId":"b689b0a8-53d0-40ab-baf2-68738e2966ac","Compress":True},"ViewerCertificate":{"CloudFrontDefaultCertificate":True}}})
log = {"LogDriver":"awslogs","Options":{"awslogs-group":ref("Logs"),"awslogs-region":ref("AWS::Region"),"awslogs-stream-prefix":"service"}}
secret = lambda key: sub("${RuntimeSecretArn}:"+key+"::")
resource("Task","AWS::ECS::TaskDefinition",{"Family":sub("${AWS::StackName}"),"RequiresCompatibilities":["FARGATE"],"NetworkMode":"awsvpc","Cpu":"2048","Memory":"8192","ExecutionRoleArn":attr("ExecutionRole","Arn"),"TaskRoleArn":attr("TaskRole","Arn"),"RuntimePlatform":{"CpuArchitecture":"X86_64","OperatingSystemFamily":"LINUX"},"Volumes":[{"Name":"state","EFSVolumeConfiguration":{"FilesystemId":ref("Filesystem"),"TransitEncryption":"ENABLED","AuthorizationConfig":{"AccessPointId":ref("AccessPoint"),"IAM":"ENABLED"}}}],"ContainerDefinitions":[
 {"Name":"cv","Image":ref("CvImage"),"Essential":True,"Cpu":1536,"Memory":6144,"PortMappings":[{"ContainerPort":8080}],"Secrets":[{"Name":"CV_SERVICE_TOKEN","ValueFrom":secret("CV_SERVICE_TOKEN")}],"LogConfiguration":log,"HealthCheck":{"Command":["CMD-SHELL","python -c 'import urllib.request; urllib.request.urlopen(\"http://127.0.0.1:8080/health\", timeout=3)'"],"Interval":30,"Timeout":5,"Retries":3,"StartPeriod":60}},
 {"Name":"web","Image":ref("WebImage"),"Essential":True,"Cpu":512,"Memory":2048,"PortMappings":[{"ContainerPort":3000}],"DependsOn":[{"ContainerName":"cv","Condition":"HEALTHY"}],"Environment":[{"Name":"AWS_REGION","Value":ref("AWS::Region")},{"Name":"CV_LOCAL_ENABLED","Value":"false"},{"Name":"CV_SERVICE_URL","Value":"http://127.0.0.1:8080"},{"Name":"CV_SERVICE_TIMEOUT_MS","Value":"240000"},{"Name":"REPORT_STORE_DIR","Value":"/app/.data/reports"},{"Name":"FLOODFLOW_PUBLIC_PROTOCOL","Value":"https"}],"Secrets":[{"Name":key,"ValueFrom":secret(key)} for key in ["CV_SERVICE_TOKEN","DEEPGRAM_API_KEY","S3_EVIDENCE_BUCKET","S3_REGION","BEDROCK_VISION_MODEL_ID","BEDROCK_RECOMMENDATION_MODEL_ID","POLLY_VOICE_ID","POLLY_SPEECH_RATE","DYNAMODB_REPORTS_TABLE","DYNAMODB_REPORTS_ARCHIVE_TABLE","DYNAMODB_ACCOUNTS_TABLE","DYNAMODB_SESSIONS_TABLE","DYNAMODB_GARAGE_TABLE","DYNAMODB_ANALYSES_TABLE","GOOGLE_STREETVIEW_API_KEY","FLOODFLOW_PASSCODE"]],"MountPoints":[{"SourceVolume":"state","ContainerPath":"/app/.data/reports","ReadOnly":False}],"LogConfiguration":log}
]})
resource("Service","AWS::ECS::Service",{"ServiceName":"floodflow","Cluster":ref("Cluster"),"TaskDefinition":ref("Task"),"LaunchType":"FARGATE","DesiredCount":1,"HealthCheckGracePeriodSeconds":120,"DeploymentConfiguration":{"MinimumHealthyPercent":0,"MaximumPercent":100},"NetworkConfiguration":{"AwsvpcConfiguration":{"AssignPublicIp":"ENABLED","Subnets":subnets,"SecurityGroups":[ref("TaskSecurity")]}},"LoadBalancers":[{"TargetGroupArn":ref("WebTarget"),"ContainerName":"web","ContainerPort":3000},{"TargetGroupArn":ref("CvTarget"),"ContainerName":"cv","ContainerPort":8080}]},DependsOn=["WebRule","CvRule","Mount0","Mount1","InternetRoute"])
template={"AWSTemplateFormatVersion":"2010-09-09","Description":"FloodFlow hackathon: app + CPU CV on ECS, HTTPS CloudFront, existing data services, retained state","Parameters":{name:{"Type":kind} for name,kind in [("WebImage","String"),("CvImage","String"),("RuntimeSecretArn","String"),("EvidenceBucket","String"),("TableArns","CommaDelimitedList"),("CloudFrontPrefixList","String")]},"Resources":r,"Outputs":{"LiveUrl":{"Value":sub("https://${Distribution.DomainName}")},"CvUrl":{"Value":sub("https://${Distribution.DomainName}")},"ClusterName":{"Value":ref("Cluster")},"FilesystemId":{"Value":ref("Filesystem")},"DistributionId":{"Value":ref("Distribution")}}}
template["Parameters"]["OriginToken"]={"Type":"String","NoEcho":True,"MinLength":32}
if __name__ == "__main__":
    destination=Path(__file__).with_name("stack.json")
    destination.write_text(json.dumps(template,indent=2)+"\n")
    print(f"Generated {len(r)} resources; existing data services are not recreated.")
