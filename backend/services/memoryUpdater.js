const { updateProspect } = require("./supabaseService");

async function updateMemory(phone, updates) {

  await updateProspect(phone, updates);

}

module.exports = {
  updateMemory
};