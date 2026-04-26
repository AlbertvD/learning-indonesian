import classes from '../ExperiencePlayer.module.css'

interface WarmInputBlockProps {
  title: string
  totalBlocks: number
  dueCount: number
  newCount: number
}

export function WarmInputBlock({ title, totalBlocks, dueCount, newCount }: WarmInputBlockProps) {
  return (
    <section className={`${classes.panel} ${classes.warmPanel}`} aria-labelledby="experience-warm-title">
      <p className={classes.eyebrow}>Dagelijkse leerroute</p>
      <h1 id="experience-warm-title">{title}</h1>
      <p className={classes.lede}>
        We warmen op met een gerichte route en gaan daarna door herhalingen en zorgvuldig geintroduceerde nieuwe vaardigheden.
      </p>
      <div className={classes.statGrid} aria-label="Sessievorm">
        <span><strong>{totalBlocks}</strong> vaardigheidskaarten</span>
        <span><strong>{dueCount}</strong> herhalingen</span>
        <span><strong>{newCount}</strong> nieuwe introducties</span>
      </div>
    </section>
  )
}
