import Navbar from "../components/public/Navbar";
import Contact from "../components/public/Contact";
import Footer from "../components/public/Footer";
import { usePageMeta } from "../hooks/usePageMeta";
import "./PublicSite.css";

export default function TeamVisionContact() {
  usePageMeta({
    title: "Contact | Team Vision Financial",
    description:
      "Contact Team Vision Financial by form, email, or phone about life insurance, retirement education, appointments, or career opportunities."
  });

  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content">
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
