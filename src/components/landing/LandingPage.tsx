import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, CarFront, Check, MapPin, Waves } from "lucide-react";
import styles from "./LandingPage.module.css";
import LandingMotion from "./LandingMotion";

function Brand() {
  return <Link href="/" className={styles.brand} aria-label="FloodFlow home"><span className={styles.brandMark}><Waves size={24} strokeWidth={2}/></span>FloodFlow<span>.</span></Link>;
}

function ReportPreview() {
  return <div className={styles.demoWindow} aria-label="Illustrative FloodFlow report preview">
    <div className={styles.demoTop}><Brand/><span className={styles.demoLabel}>Example report</span></div>
    <div className={styles.demoToolbar}><span><MapPin size={15}/> Road report</span><span>01 / Location & evidence</span></div>
    <div className={styles.demoBody}>
      <div className={styles.demoMap}><div className={styles.demoRoad}/><div className={styles.demoPin}><MapPin size={30} fill="currentColor"/></div><span className={styles.demoPlace}>Current GPS location</span><span className={styles.demoLabel}>Illustrative map</span></div>
      <div className={styles.demoFields}><div className={styles.demoPhoto}><Image src="/flood-demo.jpg" alt="Illustrative waterlogged street with vehicles and umbrellas" width={1024} height={1024} sizes="(max-width: 650px) 45vw, 320px"/><span><Camera size={14}/> Photo evidence</span></div><div className={styles.demoField}><span>LOCATION</span><strong>Road pin selected <Check size={14}/></strong></div><div className={styles.demoField}><span>VEHICLE CONTEXT</span><strong><CarFront size={17}/> Car · vehicle details added</strong></div></div>
    </div>
    <div className={styles.demoFooter}><span><Check size={14}/> Details together. Ready to review.</span><Link href="/report?mode=report">Create yours <ArrowUpRight size={15}/></Link></div>
  </div>;
}

const features = [
  { icon: MapPin, title: "A place, not a guess.", copy: "Report from the road itself. Your photo is bound to your current GPS position." },
  { icon: Camera, title: "Evidence you can see.", copy: "Add a photo of the waterlogged road and keep it with the right location." },
  { icon: CarFront, title: "Your vehicle in the picture.", copy: "Bring vehicle details into the report before you review the summary." },
];

export default function LandingPage() {
  return <div className={styles.landing}>
    <LandingMotion/>
    <a href="#main" className={styles.skip}>Skip to content</a>
    <header className={styles.header}><Brand/><nav className={styles.nav} aria-label="Main navigation"><a href="#experience">The experience</a><a href="#how">How it works</a><a href="#mission">Our mission</a><Link href="/report?mode=report" className={styles.navCta}>Report a waterlog <ArrowUpRight size={16}/></Link></nav></header>
    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-title">
        <Image className={styles.heroImage} src="/landing/rain-road.jpg" alt="Rain falling on a city street, with wet pavement and passing vehicles" fill sizes="100vw" preload/>
        <div className={styles.heroShade}/>
        <div className={styles.heroContent}><p className={styles.eyebrow}> ROAD CONTEXT. WHEN IT MATTERS.</p><h1 id="hero-title" className={styles.heroTitle}>When roads flood,<br/><span>context matters.</span></h1><p className={styles.heroCopy}>A waterlogged road is more than a pin on a map. Bring the photo, the place, and your vehicle together with FloodFlow.</p><div className={styles.heroActions}><Link href="/report?mode=report" className={styles.button}>Report a waterlog <ArrowUpRight size={19}/></Link><Link href="/map" className={styles.secondaryButton}>Browse waterlogging map <ArrowDown size={17}/></Link></div><p className={styles.heroNote}>Try the reporting prototype. No account needed.</p></div>
        <div className={styles.heroPreview}><div className={styles.previewTop}><span className={styles.previewDot}/><span className={styles.previewLabel}>A clearer picture starts here</span><ArrowUpRight size={18}/></div><div className={styles.previewDetails}><div className={styles.previewRow}><Camera size={17}/><span>What you can see</span><strong>Photo evidence</strong></div><div className={styles.previewRow}><MapPin size={17}/><span>Where it happens</span><strong>Road location</strong></div><div className={styles.previewRow}><CarFront size={17}/><span>What you drive</span><strong>Vehicle context</strong></div></div></div>
        <div className={styles.heroBottom}><span>Built for everyday roads.<br/>And the people on them.</span><a href="#mission" className={styles.scrollLink}>Discover the idea <ArrowDown size={17}/></a><span>01 — FLOODFLOW</span></div>
      </section>
      <div className={styles.signalStrip} aria-label="The three parts of a FloodFlow report"><span>BETTER CONTEXT STARTS WITH</span>{features.map(({icon:Icon,title},i)=><div className={styles.signalItem} key={title}><Icon size={21}/>{["Photo evidence","Precise location","Vehicle context"][i]}</div>)}</div>
      <section id="mission" className={styles.mission} aria-labelledby="mission-title"><p className={styles.sectionLabel}>01 / THE REASON WE EXIST</p><div className={styles.missionGrid}><div className={styles.missionCopy} data-reveal><h2 id="mission-title">Familiar road.<br/>Unfamiliar <em>conditions.</em></h2><p>One downpour can change the street you take every day. Water covers the surface. The details disappear. The questions multiply.</p><p>FloodFlow starts with something simple: keeping what you observe, where you observe it, and what you drive in one clear report.</p><a href="#experience">See the experience <ArrowRight size={18}/></a><div className={styles.missionStat}><Waves size={30}/><span>More context.<br/><strong>Less guesswork.</strong></span></div></div><figure className={styles.missionMedia} data-reveal><Image src="/landing/rain-road.jpg" alt="Rain and reflections across a busy urban road" width={1399} height={1749} sizes="(max-width: 760px) 100vw, 48vw"/><figcaption className={styles.photoCaption}>The conditions change. The need for context stays.</figcaption></figure></div></section>
      <section id="experience" className={styles.product} aria-labelledby="product-title"><div className={styles.sectionHeading} data-reveal><div><p className={styles.sectionLabel}>02 / MEET THE EXPERIENCE</p><h2 id="product-title">One report.<br/><em>The details that matter.</em></h2></div></div><div className={styles.productGrid}><div className={styles.productCopy} data-reveal><p>From the first pin to the final review, FloodFlow gives your observations a place to come together.</p><div className={styles.featureList}>{features.map(({icon:Icon,title,copy})=><article key={title}><span className={styles.featureIcon}><Icon size={23}/></span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div><Link href="/report?mode=report" className={styles.button}>Try the experience <ArrowUpRight size={18}/></Link></div><div data-reveal><ReportPreview/></div></div><p className={styles.scopeNote}>Community observations on a shared map. GPS binds reports to your current location; photos do not measure water depth or establish crossing safety.</p></section>
      <section id="how" className={styles.workflow} aria-labelledby="how-title"><div className={styles.sectionHeading} data-reveal><div><p className={styles.sectionLabel}>03 / FROM OBSERVATION TO REPORT</p><h2 id="how-title">Three steps.<br/><em>One complete picture.</em></h2></div><p>Start with what you know. Keep it all together.</p></div><div className={styles.steps}>{[{icon:MapPin,title:"Find the road.",copy:"Allow GPS at your current location. Reporting pins cannot be moved."},{icon:Camera,title:"Add your photo.",copy:"Take an on-site photo. A fresh GPS fix is bound when you select it."},{icon:CarFront,title:"Bring your context.",copy:"Add your vehicle details, review the summary, and share your report on the map."}].map(({icon:Icon,title,copy},i)=><article className={styles.step} key={title} data-reveal><div className={styles.stepNumber}>0{i+1}<ArrowUpRight size={22}/></div><span className={styles.stepIcon}><Icon size={31} strokeWidth={1.5}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className={styles.faq} aria-labelledby="faq-title"><div className={styles.faqIntro} data-reveal><p className={styles.sectionLabel}>A LITTLE MORE CLARITY</p><h2 id="faq-title">Good questions.<br/><em>Clear answers.</em></h2></div><div className={styles.faqList} data-reveal>{[{q:"What can I do with FloodFlow today?",a:"Report waterlogging at your current GPS location with an on-site photo and vehicle details, then review community observations and road routes on the map."},{q:"Will other people see my report?",a:"Yes. Sharing uploads your photo, GPS position, accuracy and time, vehicle details, and any measured depth to the community map."},{q:"Can FloodFlow tell me if a flooded road is safe?",a:"No. Routes can compare exposure to community reports, but photos and report locations cannot establish crossing safety. Unknown depth and missing vehicle specifications remain unknown."}].map(({q,a})=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
      <section className={styles.closing}><div className={styles.closingContent} data-reveal><div><p className={styles.sectionLabel}>START WITH A CLEARER PICTURE</p><h2>The road changes.<br/>Start with <em>context.</em></h2></div><div className={styles.closingActions}><Link href="/report?mode=report" className={styles.button}>Create your first report <ArrowUpRight size={20}/></Link><span>No login. Just the details that matter.</span></div></div><Waves size={240} strokeWidth={.8} aria-hidden="true"/></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerBrand}><Brand/><p>A clearer picture of the road ahead.</p></div><div className={styles.footerLinks}><a href="#mission">Our mission</a><a href="#how">How it works</a><Link href="/report?mode=report">Create a report <ArrowUpRight size={14}/></Link></div><span>© 2026 FloodFlow</span></footer>
  </div>;
}
