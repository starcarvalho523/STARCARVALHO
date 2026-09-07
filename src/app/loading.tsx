export default function Loading() {
  return (
    <div className="star-loader-overlay" role="status" aria-live="polite" aria-label="Carregando página">
      <div className="star-loader-backdrop" aria-hidden="true" />
      <div className="star-loader-card">
        <div className="star-loader-orbit" aria-hidden="true">
          <div className="star-loader-static-ring" />
          <span className="star-loader-logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/star-carvalhos-loader-logo.svg" alt="" width="96" height="96" className="star-loader-logo" />
          </span>
        </div>
        <div className="star-loader-copy"><p className="star-loader-title">Carregando...</p><p className="star-loader-subtitle">Preparando a plataforma</p></div>
        <div className="star-loader-dots" aria-hidden="true"><span /><span className="is-active" /><span /></div>
        <div className="star-loader-brand" aria-hidden="true"><strong>STAR CARVALHOS</strong><span>MAIS CONTROLE PARA O SEU ESTACIONAMENTO</span></div>
      </div>
    </div>
  );
}
