// Atlas Conversation Router v1

function routeConversation({ prospect, message, intent }) {

    switch (intent) {
  
      case "PRIMERICA":
        return {
          interrupt: true,
          reply:
  `Yes, this opportunity is with Primerica, one of the largest financial services companies in North America.
  
  I'd be happy to answer any questions you have.
  
  Now, let's continue where we left off.`
        };
  
      case "COST":
        return {
          interrupt: true,
          reply:
  `That's a great question.
  
  During the interview we'll explain the complete process, including any requirements and costs if you decide to move forward.
  
  Our goal right now is simply to determine whether this opportunity is a good fit for you.`
        };
  
      case "REMOTE":
        return {
          interrupt: true,
          reply:
  `Many activities can be completed remotely depending on the role and training.
  
  We'll explain all the details during the interview so you know exactly how everything works.`
        };
  
      default:
        return {
          interrupt: false
        };
    }
  
  }
  
  module.exports = {
    routeConversation
  };