import {getSponsorsData} from '@/lib/public-data';
import {SponsorCards} from '@/components/public/sponsors';
import {Page, SectionHeading} from '@/components/public/ui';
export const dynamic = 'force-dynamic';
export const metadata = {title: 'Sponsors', description: 'De sponsors van No Skill Just Luck.', alternates: {canonical: '/sponsors'}};
export default async function SponsorsPage() {
  const data = await getSponsorsData();
  return <Page><SectionHeading as="h1" title="Onze sponsors" intro="De mensen en bedrijven die achter No Skill Just Luck staan."/><SponsorCards data={data}/></Page>;
}
