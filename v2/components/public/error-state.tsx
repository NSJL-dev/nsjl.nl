import Link from 'next/link';

export function PublicErrorState({notFound = false, retry}: {notFound?: boolean; retry?: () => void}) {
  return <main id="main" className="pub-page pub-container pub-container--narrow pub-error-page" tabIndex={-1}><span className="pub-error-mark" aria-hidden="true">🎯</span><p className="pub-eyebrow">{notFound ? 'Die pijl is ernaast' : 'Even een worp opnieuw'}</p><h1>{notFound ? 'Pagina niet gevonden.' : 'Deze pagina kan even niet laden.'}</h1><p>{notFound ? 'Gelukkig is er altijd een volgende worp. Via de homepage vind je stand, team en nieuws.' : 'Probeer het nog een keer. Er worden geen ontbrekende cijfers ingevuld.'}</p><div className="pub-actions">{retry && <button className="pub-button" type="button" onClick={retry}>Opnieuw proberen</button>}<Link className="pub-button pub-button--secondary" href="/">Terug naar NSJL</Link></div></main>;
}
