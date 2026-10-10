import Link from "next/link";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import styles from "@/components/marketing/marketing.module.css";

const features = [
  ["✦", "AI Storytelling", "Develop short-form stories and episodes from your creative ideas."],
  ["◈", "Character Studio", "Build characters and organise them across your stories."],
  ["▣", "Cinematic Production", "Bring your storyboards to life with visual, video and audio workflows."],
  ["▤", "Creator Library", "Keep your series, episodes and production work together."],
  ["◇", "Flexible Creation Modes", "Choose Economy, Standard or Cinematic production options."],
  ["↗", "Made for Short-Form", "Create stories designed for vertical, episodic content."],
];
export default function HomePage() {
  return <MarketingLayout>
    <section className={styles.hero}>
      <img className={styles.heroImage} src="/dramaai-genre-3.webp" alt="Cinematic visual representing AI storytelling" />
      <div className={styles.heroContent}>
        <p className={styles.eyebrow}>The next chapter of storytelling</p>
        <h1 className={styles.h1}>Your imagination.<br/><span className={styles.gradient}>Infinite stories.</span></h1>
        <p className={styles.lead}>From the first idea to the final scene. Create stories, develop characters and produce cinematic short videos in one AI-powered creator studio.</p>
        <div className={styles.actions}><Link href="/signup" className={styles.primary}>Start creating free ↗</Link><Link href="/explore" className={styles.secondary}>Explore DramaAI</Link></div>
      </div>
    </section>
    <section className={styles.section}><div className={styles.sectionHead}><p className={styles.eyebrow}>Everything in one place</p><h2 className={styles.h2}>Your story deserves a studio.</h2><p className={styles.muted}>Move from an idea to a production workflow without juggling disconnected creative tools.</p></div><div className={styles.grid}>{features.map(([icon,title,body])=><article className={styles.card} key={title}><span className={styles.symbol}>{icon}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className={styles.section}><div className={styles.sectionHead}><p className={styles.eyebrow}>Explore the possibilities</p><h2 className={styles.h2}>Every genre. A new world.</h2><p className={styles.muted}>From romantic moments to thrilling twists, your next idea starts here.</p></div><div className={styles.showcase}>{[["Drama",1],["Romance",2],["Thriller",3],["Action",4],["Fantasy",5],["Adventure",6]].map(([name,id])=><figure key={name}><img src={`/dramaai-genre-${id}.webp`} alt={`${name} genre artwork`}/><figcaption>{name}</figcaption></figure>)}</div></section>
    <section className={styles.section}><div className={styles.banner}><p className={styles.eyebrow}>Ready when you are</p><h2 className={styles.h2}>The next great story starts with you.</h2><p className={styles.muted}>Create an account to access your personal DramaAI Creator Studio.</p><Link href="/signup" className={styles.primary}>Create your account ↗</Link></div></section>
  </MarketingLayout>;
}
