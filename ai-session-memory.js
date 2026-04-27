(function(){
  var storageKey="jobMatchAgentAiSessionMemory";
  var maxEntriesPerPane=8;
  var maxStoredTextLength=5000;

  function trim(value){return String(value||"").replace(/^\s+|\s+$/g,"");}
  function cleanText(value){return trim(String(value||"").replace(/\s+/g," "));}
  function normalizePane(pane){return cleanText(pane).toLowerCase()||"general";}
  function loadStore(){var raw="";try{raw=window.localStorage?window.localStorage.getItem(storageKey):"";}catch(e){raw="";}if(!raw){return {};}try{return JSON.parse(raw)||{};}catch(err){return {};}}
  function saveStore(store){try{if(window.localStorage){window.localStorage.setItem(storageKey,JSON.stringify(store||{}));}}catch(e){}}
  function normalizeEntry(text,meta){var clean=trim(text);if(!clean){return null;}return {text:clean.slice(0,maxStoredTextLength),summary:cleanText(clean).slice(0,400),meta:meta||{},savedAt:new Date().toISOString()};}
  function remember(pane,text,meta){var key=normalizePane(pane),store=loadStore(),entries=Array.isArray(store[key])?store[key]:[],entry=normalizeEntry(text,meta),i;if(!entry){return [];}for(i=0;i<entries.length;i+=1){if(entries[i]&&entries[i].summary===entry.summary){return entries;}}entries.unshift(entry);store[key]=entries.slice(0,maxEntriesPerPane);saveStore(store);return store[key];}
  function getEntries(pane){var key=normalizePane(pane),store=loadStore(),entries=store[key];return Array.isArray(entries)?entries:[];}
  function getVariant(pane){return getEntries(pane).length;}
  function buildAvoidanceText(pane){var entries=getEntries(pane),parts=[],i;for(i=0;i<entries.length;i+=1){parts.push("Previous output "+(i+1)+":\n"+String(entries[i].text||"").slice(0,900));}return parts.join("\n\n");}
  function clearPane(pane){var key=normalizePane(pane),store=loadStore();delete store[key];saveStore(store);}
  window.jobMatchAiSessionMemory={remember:remember,getEntries:getEntries,getVariant:getVariant,buildAvoidanceText:buildAvoidanceText,clearPane:clearPane};
})();
