import {getPublicData} from '@/lib/public-data';
import {NewsCards} from '@/components/public/news';
import {Page, SectionHeading} from '@/components/public/ui';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Nieuws & updates', description: 'Wedstrijdverhalen, teamnieuws en aankondigingen van No Skill Just Luck.', alternates: {canonical: '/nieuws'}};
export default async function NewsOverview() {
  const data = await getPublicData();
  return <Page><SectionHeading as="h1" title="Nieuws & Updates" intro="Het laatste NSJL-nieuws. En soms gewoon iets wat we kwijt willen."/><NewsCards data={data}/></Page>;
}
