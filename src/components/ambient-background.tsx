/**
 * Fundo ambiente: uma malha fina de pontos, discreta e monocromática, que
 * desvanece nas beiradas. Estático e puramente decorativo (aria-hidden, sem
 * captura de eventos) — dá textura sutil ao app sem roubar a atenção. Toda a
 * aparência mora na classe `.ambient` do globals.css.
 */
export function AmbientBackground() {
  return <div className="ambient" aria-hidden />;
}
