import { langGraphAdapter } from '@moldea.ai/adapter-langgraph';

if (langGraphAdapter.id !== 'langgraph') {
  throw new TypeError('The LangGraph adapter export is invalid.');
}
