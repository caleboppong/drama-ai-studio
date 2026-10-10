import Link from "next/link";
import styles from "./marketing.module.css";

const links = [["Home", "/"], ["Explore", "/explore"], ["Features", "/features"], ["Pricing", "/pricing"], ["About", "/about"], ["Contact", "/contact"]];

export default function MarketingLayout({ children }) {
  return <div className={styles.site}>
    <header className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="DramaAI Studio home"><span className={styles.logoMark}>D</span>Drama<span>AI</span><small>STUDIO</small></Link>
      <nav className={styles.nav} aria-label="Main navigation">{links.map(([name, href]) => <Link href={href} key={href}>{name}</Link>)}</nav>
      <div className={styles.account}><Link href="/login" className={styles.signin}>Sign in</Link><Link href="/signup" className={styles.ctaSmall}>Get started ↗</Link></div>
    </header>
    <main>{children}</main>
    <footer className={styles.footer}>
      <div><Link href="/" className={styles.logo}>Drama<span>AI</span> Studio</Link><p>Make your next story impossible to ignore.</p></div>
      <nav aria-label="Footer navigation">{links.map(([name,href])=><Link key={href} href={href}>{name}</Link>)}<Link href="/login">Sign in</Link><Link href="/signup">Create account</Link></nav>
      <p className={styles.copyright}>© {new Date().getFullYear()} DramaAI Studio. All rights reserved.</p>
    </footer>
  </div>;
}
