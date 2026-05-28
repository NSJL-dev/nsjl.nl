
import { Link } from 'react-router-dom'

export default function BottomNav(){
  return(
    <div className="bottom-nav">
      <Link to="/">🏠</Link>
      <Link to="/matches">🎯</Link>
      <Link to="/team">👥</Link>
      <Link to="/stats">📊</Link>
    </div>
  )
}
