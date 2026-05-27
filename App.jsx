
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Team from './pages/Team'
import Matches from './pages/Matches'
import Stats from './pages/Stats'

export default function App(){
  return(
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/team" element={<Team />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
      <BottomNav />
    </>
  )
}
