import test from 'node:test';import assert from 'node:assert/strict';import {installPetChatCompat} from '../src/llm-compat.mjs';
test('只调整桌宠的会话标识与输出上限，其他请求原样保留，卸载恢复',()=>{
  const calls=[],llm={stream(options){calls.push(options);return this;}};const original=llm.stream;const undo=installPetChatCompat(llm);
  assert.equal(llm.stream({sessionId:'dsh-pet',maxTokens:256000,model:'deepseek-flash'}),llm);assert.match(calls[0].sessionId,/^[0-9a-f-]{36}$/);assert.equal(calls[0].maxTokens,1024);assert.equal(calls[0].model,'deepseek-flash');
  const other={sessionId:'another-session',maxTokens:8000};llm.stream(other);assert.equal(calls[1],other);undo();assert.equal(llm.stream,original);
});
