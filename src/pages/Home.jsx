import { useState } from "react";
import FeaturedTabs from "../components/FeaturedTabs.jsx";
import HeroScope from "../components/HeroScope.jsx";
import CardGrid from "../components/CardGrid.jsx";
import PersonalStrip from "../components/PersonalStrip.jsx";
import { HERO } from "../lib/homeData.js";
import "../styles/home.css";

export default function Home() {
  const [tab, setTab] = useState("one");
  return (
    <>
      <FeaturedTabs active={tab} onChange={setTab} />
      <HeroScope hero={HERO[tab]} />
      <CardGrid />
      <PersonalStrip />
    </>
  );
}
