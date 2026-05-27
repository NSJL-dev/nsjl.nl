
import { Link } from 'react-router-dom'

export default function Navbar(){
  return(
    <nav className="nav">
      <div className="container nav-inner">
        <h2>NSJL</h2>

        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/team">Team</Link>
          <Link to="/matches">Wedstrijden</Link>
          <Link to="/stats">Stats</Link>
        </div>
      </div>
    </nav>
  )
}
