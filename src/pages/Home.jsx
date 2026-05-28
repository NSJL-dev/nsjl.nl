
import { motion } from 'framer-motion'

export default function Home(){
  return(
    <div className="container">
      <section className="hero">
        <motion.h1
          initial={{opacity:0,y:40}}
          animate={{opacity:1,y:0}}
        >
          NSJL
        </motion.h1>

        <p>No Skill Just Luck — Rayon Reusel 3e Divisie</p>

        <a className="btn">Bekijk Live Stand</a>
      </section>

      <section className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))'}}>
        <div className="card">
          <h3>Volgende wedstrijd</h3>
          <p style={{marginTop:'12px'}}>NSJL vs Dart Devils</p>
          <p style={{marginTop:'8px'}}>Vrijdag 20:00</p>
        </div>

        <div className="card">
          <h3>Live Stand</h3>
          <h1 style={{marginTop:'12px'}}>4 - 3</h1>
        </div>

        <div className="card">
          <h3>Beste Finish</h3>
          <h1 style={{marginTop:'12px'}}>144</h1>
        </div>
      </section>
    </div>
  )
}
