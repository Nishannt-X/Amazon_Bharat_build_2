import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, CarFront, Check, MapPin, Route, Waves } from "lucide-react";
import styles from "./LandingPage.module.css";
import LandingMotion from "./LandingMotion";

function Brand() {
  return <Link href="/" className={styles.brand} aria-label="FloodFlow home"><span className={styles.brandMark}><Waves size={24} strokeWidth={2}/></span>FloodFlow<span>.</span></Link>;
}

function JourneyMap() {
  const reportedRoad = "M178 352 350 302 365 322 377 358 386 417 404 431 427 396 437 382 470 360 467 332 453 302 463 270 505 243 570 215 604 197 Q623 169 600 132";
  const alternativeRoad = "M178 352 350 302 505 243 570 215 604 197 Q623 169 600 132";

  return <div className={styles.routeMap}>
    <svg viewBox="110 70 610 430" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Example map near Kashmere Gate: both routes start at the marked source and end at the same destination; orange passes a waterlogging report and blue goes around it">
      <image href="/landing/kashmere-gate-example-map.png" x="0" y="0" width="908" height="653"/>
      <path className={styles.routeRiskPath} d={reportedRoad}/>
      <path className={styles.routeBetterPath} d={alternativeRoad}/>
      <circle cx="470" cy="360" r="25" className={styles.routeFloodHalo}/>
      <circle cx="470" cy="360" r="15" className={styles.routeFlood}/>
      <path d="M470 352v10m0 5h.01" className={styles.routeFloodMark}/>
      <circle cx="178" cy="352" r="18" className={styles.routeEndpoint}/>
      <circle cx="178" cy="352" r="6" fill="white"/>
      <circle cx="600" cy="132" r="18" className={styles.routeEndpoint}/>
      <circle cx="600" cy="132" r="6" fill="white"/>
      <g className={styles.mapEndpointLabels}>
        <rect x="137" y="298" width="82" height="30" rx="5"/><text x="178" y="318" textAnchor="middle">SOURCE</text>
        <rect x="537" y="78" width="126" height="30" rx="5"/><text x="600" y="98" textAnchor="middle">DESTINATION</text>
      </g>
    </svg>
    <span className={styles.routeMapLabel}>Illustrative Kashmere Gate map · example routes</span>
  </div>;
}

function JourneyPreview() {
  return <div className={styles.demoWindow} data-tilt aria-label="Illustrative journey from a road report to comparing routes">
    <div className={styles.demoTop}><Brand/><span className={styles.demoLabel}>Example journey</span></div>
    <div className={styles.demoToolbar}><span><Camera size={15}/> Road evidence</span><span>Then map & routes</span></div>
    <div className={`${styles.demoBody} ${styles.routeDemoBody}`}>
      <JourneyMap/>
      <div className={styles.routeChoices}>
        <p className={styles.routeChoicesEyebrow}>FROM REPORT TO ROUTE</p>
        <h3>Waterlogging reported? Compare another road.</h3>
        <div className={styles.journeyEvidence}><Camera size={18}/><div><strong>Photo + current GPS</strong><small>Road and vehicle context reviewed</small></div><Check size={17}/></div>
        <div className={styles.routeChoiceRisk}><span className={styles.routeChoiceLineRisk}/><div><strong>Route 1 · via Kashmere Gate</strong><small>Passes the waterlogging report</small></div></div>
        <div className={styles.routeChoiceBetter}><span className={styles.routeChoiceLineBetter}/><div><strong>Route 2 · via NH-24</strong><small>Goes around the reported spot</small></div><Check size={17}/></div>
        <p className={styles.routeChoiceNote}>Route checks use past reports. Conditions can change.</p>
      </div>
    </div>
    <div className={styles.demoFooter}><span>Evidence first. A route choice next.</span><Link href="/map">Explore routes <ArrowUpRight size={15}/></Link></div>
  </div>;
}

const features = [
  { icon: Camera, title: "Capture the road.", copy: "Add an on-site photo with a fresh GPS fix so the report stays tied to that spot." },
  { icon: CarFront, title: "Review the context.", copy: "Check the photo evidence, add your vehicle, and keep unknown conditions visible." },
  { icon: MapPin, title: "See community reports.", copy: "Browse reported waterlogging on the map when evidence passes sharing checks." },
  { icon: Route, title: "Compare your routes.", copy: "Check available road alternatives against reports near each route." },
];

export default function LandingPage() {
  return <div className={styles.landing} data-motion="on">
    <a href="#main" className={styles.skip}>Skip to content</a>
    <header className={styles.header}><Brand/><nav className={styles.nav} aria-label="Main navigation"><a href="#experience">The experience</a><a href="#how">How it works</a><a href="#mission">Our mission</a><Link href="/report?mode=report" className={styles.navCta}>Report a waterlog <ArrowUpRight size={16}/></Link></nav></header>
    <main id="main">
      <section className={styles.hero} aria-labelledby="hero-title">
        <Image className={styles.heroImage} src="/landing/rain-road.jpg" alt="Rain falling on a city street, with wet pavement and passing vehicles" fill sizes="100vw" preload/>
        <div className={styles.heroShade}/>
        <div className={styles.heroContent}><p className={styles.eyebrow}> ROAD CONTEXT. WHEN IT MATTERS.</p><h1 id="hero-title" className={styles.heroTitle}>When roads flood,<br/><span>context matters.</span></h1><p className={styles.heroCopy}>A waterlogged road is more than a pin on a map. Bring the photo, the place, and your vehicle together with FloodFlow.</p><div className={styles.heroActions}><Link href="/report?mode=report" className={styles.button}>Report a waterlog <ArrowUpRight size={19}/></Link><Link href="/map" className={styles.secondaryButton}>Browse waterlogging map <ArrowDown size={17}/></Link></div><p className={styles.heroNote}>Try the reporting prototype. No account needed. <LandingMotion /></p></div>
        <div className={styles.heroPreview} data-tilt><div className={styles.previewTop}><span className={styles.previewDot}/><span className={styles.previewLabel}>A clearer picture starts here</span><ArrowUpRight size={18}/></div><div className={styles.previewDetails}><div className={styles.previewRow}><Camera size={17}/><span>What you can see</span><strong>Photo evidence</strong></div><div className={styles.previewRow}><MapPin size={17}/><span>Where it happens</span><strong>Road location</strong></div><div className={styles.previewRow}><CarFront size={17}/><span>What you drive</span><strong>Vehicle context</strong></div></div></div>
        <div className={styles.heroBottom}><span>Built for everyday roads.<br/>And the people on them.</span><a href="#mission" className={styles.scrollLink}>Discover the idea <ArrowDown size={17}/></a><span>01 — FLOODFLOW</span></div>
      </section>
      <div className={styles.signalStrip} aria-label="The FloodFlow journey"><span>FROM ROAD REPORT TO ROUTE</span>{features.map(({icon:Icon,title},i)=><div className={styles.signalItem} key={title}><Icon size={21}/>{["Photo & GPS","Evidence review","Community map","Route comparison"][i]}</div>)}</div>
      <section id="mission" className={styles.mission} aria-labelledby="mission-title"><p className={styles.sectionLabel}>01 / THE REASON WE EXIST</p><div className={styles.missionGrid}><div className={styles.missionCopy} data-reveal><h2 id="mission-title">Familiar road.<br/>Unfamiliar <em>conditions.</em></h2><p>One downpour can change the street you take every day. Water covers the surface. The details disappear. The questions multiply.</p><p>FloodFlow starts with something simple: keeping what you observe, where you observe it, and what you drive in one clear report.</p><a href="#experience">See the experience <ArrowRight size={18}/></a><div className={styles.missionStat}><Waves size={30}/><span>More context.<br/><strong>Less guesswork.</strong></span></div></div><figure className={styles.missionMedia} data-reveal data-tilt><Image src="/landing/rain-road.jpg" alt="Rain and reflections across a busy urban road" width={1399} height={1749} sizes="(max-width: 760px) 100vw, 48vw"/><figcaption className={styles.photoCaption}>The conditions change. The need for context stays.</figcaption></figure></div></section>
      <section id="experience" className={styles.product} aria-labelledby="product-title"><div className={styles.sectionHeading} data-reveal><div><p className={styles.sectionLabel}>02 / MEET THE EXPERIENCE</p><h2 id="product-title">From what you see<br/><em>to where you go.</em></h2></div></div><div className={styles.productGrid}><div className={styles.productCopy} data-reveal><p>FloodFlow connects an on-site report with the shared map and a route check. Each step adds context for the next decision.</p><div className={styles.featureList}>{features.map(({icon:Icon,title,copy})=><article key={title}><span className={styles.featureIcon}><Icon size={23}/></span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div><Link href="/report?mode=report" className={styles.button}>Start a road report <ArrowUpRight size={18}/></Link><Link href="/map" className={styles.productMapLink}>Or explore map & routes <ArrowRight size={17}/></Link></div><div data-reveal><JourneyPreview/></div></div><p className={styles.scopeNote}>Reports and routes describe past observations. They do not confirm current road conditions or whether crossing water is safe.</p></section>
      <section id="how" className={styles.workflow} aria-labelledby="how-title"><div className={styles.sectionHeading} data-reveal><div><p className={styles.sectionLabel}>03 / HOW IT COMES TOGETHER</p><h2 id="how-title">Four clear steps.<br/><em>One connected journey.</em></h2></div><p>Start with road evidence. Use it to understand the map and your options.</p></div><div className={styles.steps}>{[{icon:Camera,title:"Add road evidence.",copy:"Upload a photo from the road. FloodFlow binds a fresh GPS fix to it."},{icon:CarFront,title:"Review the context.",copy:"Check the photo analysis and add your vehicle details before saving."},{icon:MapPin,title:"Explore reports.",copy:"See shared observations on the map when reports meet publication checks."},{icon:Route,title:"Compare routes.",copy:"Set a destination and compare available roads against nearby reports."}].map(({icon:Icon,title,copy},i)=><article className={styles.step} key={title} data-reveal><div className={styles.stepNumber}>0{i+1}<ArrowUpRight size={22}/></div><span className={styles.stepIcon}><Icon size={31} strokeWidth={1.5}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className={styles.faq} aria-labelledby="faq-title"><div className={styles.faqIntro} data-reveal><p className={styles.sectionLabel}>A LITTLE MORE CLARITY</p><h2 id="faq-title">Good questions.<br/><em>Clear answers.</em></h2></div><div className={styles.faqList} data-reveal>{[{q:"What can I do with FloodFlow today?",a:"Report waterlogging with an on-site photo and GPS, review photo and vehicle context, browse shared reports, and compare available road routes."},{q:"Will other people see my report?",a:"Reports appear on the shared map only when evidence meets publication checks. Your photo, GPS position and vehicle details are saved with the report."},{q:"How are routes compared?",a:"FloodFlow checks available driving routes against past reports near each route and highlights the one with fewer report warnings. That does not prove the road is clear."},{q:"Can FloodFlow tell me if a flooded road is safe?",a:"No. Routes can compare exposure to community reports, but photos and report locations cannot establish crossing safety. Unknown depth and missing vehicle specifications remain unknown."}].map(({q,a})=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
      <section className={styles.closing}><div className={styles.closingContent} data-reveal><div><p className={styles.sectionLabel}>START WITH A CLEARER PICTURE</p><h2>The road changes.<br/>Start with <em>context.</em></h2></div><div className={styles.closingActions}><Link href="/report?mode=report" className={styles.button}>Create your first report <ArrowUpRight size={20}/></Link><span>No login. Just the details that matter.</span></div></div><Waves size={240} strokeWidth={.8} aria-hidden="true"/></section>
    </main>
    <footer className={styles.footer}><div className={styles.footerBrand}><Brand/><p>A clearer picture of the road ahead.</p></div><div className={styles.footerLinks}><a href="#mission">Our mission</a><a href="#how">How it works</a><Link href="/report?mode=report">Create a report <ArrowUpRight size={14}/></Link></div><span>© 2026 FloodFlow</span></footer>
  </div>;
}
