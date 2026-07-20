import Navbar from "../components/public/Navbar";
import Hero from "../components/public/Hero";
import About from "../components/public/About";
import Services from "../components/public/Services";
import Careers from "../components/public/Careers";
import Contact from "../components/public/Contact";
import Footer from "../components/public/Footer";
import "./PublicSite.css";

export default function Home() {
  return (
    <div className="public-site">
      <Navbar />
      <main id="main-content">
        <Hero />
        <About />
        <Services />
        <Careers />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
