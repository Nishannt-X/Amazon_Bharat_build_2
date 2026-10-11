"""Rebuild the README's diagrams: python3 docs/assets/generate_diagrams.py."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from matplotlib.font_manager import findfont, FontProperties

ROOT = Path(__file__).resolve().parent
BG, INK, MUTED = '#F7F6F1', '#153D3C', '#657876'
TEAL, AMBER, BORDER = '#237B70', '#F2B85D', '#D8E2DB'
FONT = findfont('DejaVu Sans')
BOLD = findfont(FontProperties(family='DejaVu Sans', weight='bold'))

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)

def text(d, xy, value, size=25, fill=INK, bold=False):
    d.text(xy, value, fill=fill, font=font(size, bold))

def canvas(height):
    image = Image.new('RGB', (1800, height), BG)
    return image, ImageDraw.Draw(image)

def card(d, box, eyebrow, title, lines, accent=TEAL):
    x, y, w, h = box
    d.rounded_rectangle((x,y,x+w,y+h), radius=22, fill='white', outline=BORDER, width=2)
    d.rounded_rectangle((x+24,y+25,x+30,y+60), radius=3, fill=accent)
    text(d,(x+48,y+25),eyebrow.upper(),18,accent,True)
    title_size = 29
    while d.textlength(title, font=font(title_size, True)) > w-54:
        title_size -= 1
    text(d,(x+27,y+77),title,title_size,INK,True)
    for i,line in enumerate(lines):
        text(d,(x+27,y+126+i*35),line,22,MUTED)

def arrow(d, points, color=TEAL):
    d.line(points,fill=color,width=4,joint='curve')
    (px,py),(x,y)=points[-2:]
    if x>px: tri=[(x,y),(x-13,y-8),(x-13,y+8)]
    elif x<px: tri=[(x,y),(x+13,y-8),(x+13,y+8)]
    elif y>py: tri=[(x,y),(x-8,y-13),(x+8,y-13)]
    else: tri=[(x,y),(x-8,y+13),(x+8,y+13)]
    d.polygon(tri,fill=color)

def header(d, tag, title, subtitle):
    text(d,(70,40),'FloodFlow',32,TEAL,True)
    text(d,(1430,53),tag,18,MUTED,True)
    text(d,(70,105),title,48,INK,True)
    text(d,(70,171),subtitle,25,MUTED)

image,d=canvas(1210)
header(d,'SYSTEM ARCHITECTURE','From one photo to shared road context.',
       'Current runtime: local geometry + AWS reasoning, with durable server-side evidence.')
arrow(d,[(510,330),(650,330)])
text(d,(531,285),'HTTPS',20,TEAL,True)
arrow(d,[(1110,330),(1300,330)])
text(d,(1135,284),'Persist / read',19,TEAL,True)
for x in [320,880,1480]:
    arrow(d,[(880,440),(880,500),(x,500),(x,590)])
text(d,(345,532),'Image geometry',21,TEAL,True)
text(d,(905,532),'Scene + advice',21,TEAL,True)
text(d,(1500,532),'Optional voice',21,TEAL,True)
card(d,(70,250,440,190),'01 / Citizen','Browser experience',[
    'Photo upload + device GPS','Map, vehicle, context chat'])
card(d,(650,250,460,190),'02 / Orchestrator','Next.js API layer',[
    'Stream progress + validate uploads','Owner-scoped analysis / sessions'])
card(d,(1300,250,430,190),'03 / Persistence','SQLite metadata + evidence',[
    'Reports, accounts and garage','Photo / baseline snapshots'])
card(d,(70,590,500,230),'Measurement engine','Python CV worker',[
    'OpenCV matching + reference spans','Object candidates + water mask','Depth range + pixel annotations'])
card(d,(650,590,460,230),'AWS runtime integration','Amazon Bedrock',[
    'Visible road / traffic context','Observation questions','Vehicle-aware recommendations'],AMBER)
card(d,(1230,590,500,230),'AWS optional voice','Transcribe + Polly + S3',[
    'Question audio / answer transcript','Private recording + output objects','Text remains available without voice'],AMBER)
text(d,(70,865),'Two kinds of evidence, one record.',26,INK,True)
text(d,(70,909),'CV supplies geometry. Bedrock supplies semantic context. Both preserve their source and uncertainty.',23,MUTED)
d.rounded_rectangle((70,980,1730,1125),radius=20,fill='#EDF2E8',outline=BORDER,width=2)
text(d,(98,1002),'CLOUD DEPLOYMENT BLUEPRINT  /  TERRAFORM',19,TEAL,True)
text(d,(98,1041),'Private S3 bucket   ·   DynamoDB tables + indexes   ·   App Runner IAM role',28,INK,True)
text(d,(98,1086),'Infrastructure definitions are included; runtime metadata migration and app deployment are separate steps.',21,MUTED)
text(d,(70,1162),'AWS services run when configured. The registered dry reference is currently a supplied demo image.',20,MUTED)
image.save(ROOT/'architecture.png',optimize=True)

image,d=canvas(1060)
header(d,'EVIDENCE PIPELINE','Measure the scene. Keep the context.',
       'A traceable path from a citizen observation to vehicle-aware guidance and a map pin.')
steps=[
 ((70,275,510,220),'01 / Capture','Photo + GPS',['Bound coordinates and timestamp','Decode and sanitize image']),
 ((645,275,510,220),'02 / Compare','Registered dry reference',['Match static scene features','Account for viewpoint / occlusion']),
 ((1220,275,510,220),'03 / Measure','Visible local references',['Find candidate objects + water','Estimate depth and a range']),
 ((1220,625,510,220),'04 / Enrich','Context + vehicle',['Bedrock asks about missing context','Apply selected vehicle references']),
 ((645,625,510,220),'05 / Preserve','Save evidence record',['UUID, images, annotations, answers','Keep photo-only analysis snapshot']),
 ((70,625,510,220),'06 / Share','Named point on the map',['Reverse-geocode GPS to a place','Pending private details stay hidden']),
]
arrow(d,[(580,385),(645,385)])
arrow(d,[(1155,385),(1220,385)])
arrow(d,[(1475,495),(1475,625)])
arrow(d,[(1220,735),(1155,735)])
arrow(d,[(645,735),(580,735)])
for box,eyebrow,title,lines in steps:card(d,box,eyebrow,title,lines)
d.rounded_rectangle((70,913,1730,1004),radius=18,fill='#FFF0D8')
text(d,(98,934),'DEPTH RANGE + SOURCE + CONFIDENCE',20,INK,True)
text(d,(98,969),'Pixel geometry needs a valid physical scale. A matched scene and a high score alone do not prove safe passage.',22,MUTED)
image.save(ROOT/'evidence-flow.png',optimize=True)
print('Created architecture.png and evidence-flow.png')
