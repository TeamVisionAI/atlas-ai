import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getProspect } from "../services/prospectService";

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

    <div style={{ padding:40 }}>

      <h1>{prospect.name}</h1>

      <h3>{prospect.current_step}</h3>

      <hr />

      <p><b>Phone</b> {prospect.phone}</p>

      <p><b>Language</b> {prospect.language}</p>

      <p><b>City</b> {prospect.city}</p>

      <p><b>Occupation</b> {prospect.occupation}</p>

      <hr />

      <h3>Interview</h3>

      <p>{prospect.interview_time}</p>

      <p>{prospect.interview_type}</p>

    </div>

  );

}