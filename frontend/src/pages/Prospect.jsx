import { useParams } from "react-router-dom";
import { getProspect } from "../services/prospectService";
import { useEffect, useState } from "react";
import InfoCard from "../components/InfoCard";
import InterviewCard from "../components/InterviewCard";
import PipelineCard from "../components/PipelineCard";
import ConversationCard from "../components/ConversationCard";
import NotesCard from "../components/NotesCard";
import AIRecommendationCard from "../components/AIRecommendationCard";

export default function Prospect() {

  const { id } = useParams();

  const [prospect, setProspect] = useState(null);

  useEffect(() => {

    async function load() {

      const data = await getProspect(id);

      setProspect(data);

    }

    load();

  }, [id]);

  if (!prospect)

    return <h2>Loading...</h2>;

    return (
      <div style={{ padding: 30 }}>
        <h1>{prospect.name}</h1>
    
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20
          }}
        >
          <InfoCard prospect={prospect} />
          <InterviewCard prospect={prospect} />
          <PipelineCard prospect={prospect} />
          <ConversationCard prospect={prospect} />
        </div>
    
        <div style={{ marginTop: 20 }}>
          <NotesCard />
        </div>
    
        <div style={{ marginTop: 20 }}>
          <AIRecommendationCard />
        </div>
      </div>
    );
}