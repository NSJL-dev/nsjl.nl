
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  {name:'P1', avg:58},
  {name:'P2', avg:61},
  {name:'P3', avg:54},
]

export default function Stats(){
  return(
    <div className="container" style={{paddingTop:'120px',paddingBottom:'120px'}}>
      <h1 className="section-title">Statistieken</h1>

      <div className="card" style={{height:'400px'}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="avg" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
