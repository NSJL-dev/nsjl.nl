
import { players } from '../data/players'

export default function Team(){
  return(
    <div className="container" style={{paddingTop:'120px',paddingBottom:'120px'}}>
      <h1 className="section-title">Team</h1>

      <div className="grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))'}}>
        {players.map(player=>(
          <div className="card" key={player.id}>
            <h2>{player.name}</h2>
            <p style={{marginTop:'8px'}}>{player.nickname}</p>

            <div style={{marginTop:'20px'}}>
              <p>Gemiddelde: {player.average}</p>
              <p>Beste finish: {player.finish}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
