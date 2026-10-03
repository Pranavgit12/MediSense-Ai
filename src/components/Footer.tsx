export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <p className="site-footer-brand">MediSense<span> AI</span></p>
          <p className="site-footer-copy">
            Medical information, not medical advice. MediSense does not diagnose conditions,
            prescribe treatment, or replace professional care. If you feel unwell or worried,
            contact a healthcare professional. In an emergency, contact your local emergency number.
          </p>
        </div>
        <p className="site-footer-copyright">&copy; {new Date().getFullYear()} MediSense</p>
      </div>
    </footer>
  );
}
