const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');

const MODEL_PRICING = {
  // Codex Primary Models (Mapped to GPT-4o equivalent API costs)
  'gpt-5.3-codex': { input: 1.75 / 1e6, cacheRead: 0.175 / 1e6, output: 14.00 / 1e6, reasoningResult: 14.00 / 1e6 },
  'gpt-5.2-codex': { input: 1.75 / 1e6, cacheRead: 0.175 / 1e6, output: 14.00 / 1e6, reasoningResult: 14.00 / 1e6 },
  'gpt-5.1-codex-max': { input: 1.25 / 1e6, cacheRead: 0.125 / 1e6, output: 10.00 / 1e6, reasoningResult: 10.00 / 1e6 },
  'gpt-5.2': { input: 1.75 / 1e6, cacheRead: 0.175 / 1e6, output: 14.00 / 1e6, reasoningResult: 14.00 / 1e6 },
  
  // Codex Mini Model (Mapped to GPT-4o-Mini equivalent API costs)
  'gpt-5.1-codex-mini': { input: 0.25 / 1e6, cacheRead: 0.025 / 1e6, output: 2.00 / 1e6, reasoningResult: 2.00 / 1e6 },
};

// Fallback pricing for unknown codex models. Indicates pricing is unavailable.
const DEFAULT_PRICING = { input: 0, cacheRead: 0, output: 0, reasoningResult: 0, unknown: true };

function getPricing(model) {
  if (!model) return DEFAULT_PRICING;
  const m = model.toLowerCase();
  
  if (m.includes('5.3')) return MODEL_PRICING['gpt-5.3-codex'];
  if (m.includes('codex-mini')) return MODEL_PRICING['gpt-5.1-codex-mini'];
  if (m.includes('codex-max')) return MODEL_PRICING['gpt-5.1-codex-max'];
  if (m.includes('5.2-codex')) return MODEL_PRICING['gpt-5.2-codex'];
  if (m.includes('5.2')) return MODEL_PRICING['gpt-5.2'];
  
  return DEFAULT_PRICING;
}

function getCodexDir() {
  return path.join(os.homedir(), '.codex');
}

function q(sql) {
  const dbPath = path.join(getCodexDir(), 'state_5.sqlite');
  try {
    const r = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" });
    if (r.error || r.status !== 0) return []; // Gracefully handle if sqlite3 is missing or fails
    const out = r.stdout ? r.stdout.trim() : "";
    return out ? JSON.parse(out) : [];
  } catch (e) {
    return [];
  }
}

async function parseJSONLFile(filePath) {
  const lines = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }
  return lines;
}

// Codex IDEs often inject massive context blocks before the actual user prompt
// e.g. "# Context from my IDE setup: ... ## My request for Codex: [Actual Prompt]"
// This function strips that out for a much cleaner dashboard UI
function cleanPrompt(text) {
  if (!text) return "(No Prompt)";
  
  // Look for the standard Codex IDE request delimiter
  const splitIdx = text.lastIndexOf("## My request for Codex:");
  if (splitIdx !== -1) {
    const extracted = text.substring(splitIdx + "## My request for Codex:".length).trim();
    if (extracted) return extracted;
  }
  
  return text.trim();
}

function normalizeReasoningLevel(level) {
  if (level === null || level === undefined) return null;

  if (typeof level === 'number') {
    if (level <= 1) return 'low';
    if (level === 2) return 'medium';
    if (level === 3) return 'high';
    return 'very_high';
  }

  const raw = String(level).trim().toLowerCase();
  if (!raw) return null;

  if (raw === 'low' || raw === '1') return 'low';
  if (raw === 'med' || raw === 'medium' || raw === '2') return 'medium';
  if (raw === 'high' || raw === '3') return 'high';
  if (raw === 'very high' || raw === 'very_high' || raw === 'veryhigh' || raw === '4') return 'very_high';

  return null;
}

function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function extractSessionData(entries) {
  const queries = [];
  let pendingPrompt = null;
  let continuations = 0;
  let maxRequestInputForPrompt = 0;
  
  let baselineTotalInput = 0;
  let baselineTotalOutput = 0;
  let baselineTotalCached = 0;
  let baselineReasoningOutput = 0;

  let currentTotalInput = 0;
  let currentTotalOutput = 0;
  let currentTotalCached = 0;
  let currentReasoningOutput = 0;

  let currentModel = null;
  let currentReasoningLevel = null;

  let lastSeenInput = 0;
  let lastSeenOutput = 0;

  for (const row of entries) {
    if (row.type === "turn_context" && row.payload?.model) {
      currentModel = row.payload.model;
    }
    
    if (row.type === "turn_context" && row.payload?.collaboration_mode?.settings?.reasoning_effort) {
      currentReasoningLevel = normalizeReasoningLevel(row.payload.collaboration_mode.settings.reasoning_effort);
    }

    if (row.type === "event_msg" && row.payload?.type === "token_count" && row.payload?.info?.total_token_usage) {
      const u = row.payload.info.total_token_usage;
      currentTotalInput = u.input_tokens || 0;
      currentTotalOutput = u.output_tokens || 0;
      currentTotalCached = u.cached_input_tokens || 0;
      currentReasoningOutput = u.reasoning_output_tokens || 0;
    }

    if (row.type === "response_item" && row.payload?.type === "message" && row.payload?.role === "user") {
      if (pendingPrompt !== null) {
        const diffInput = currentTotalInput - baselineTotalInput;
        const diffOutput = currentTotalOutput - baselineTotalOutput;
        const diffCached = currentTotalCached - baselineTotalCached;
        const diffReasoning = currentReasoningOutput - baselineReasoningOutput;

        if (diffInput > 0 || diffOutput > 0) {
          queries.push({
            userPrompt: pendingPrompt,
            model: currentModel,
            reasoningLevel: currentReasoningLevel,
            inputTokens: diffInput,
            outputTokens: Math.max(0, diffOutput - diffReasoning), // don't double count
            cachedTokens: diffCached,
            reasoningTokens: diffReasoning,
            totalTokens: diffInput + diffOutput,
            requestInputTokens: maxRequestInputForPrompt,
            continuations: Math.max(0, continuations - 1)
          });
        }
      }

      const texts = (row.payload.content || []).filter(c => c.type === 'input_text' || c.type === 'text');
      const rawPrompt = texts.length > 0 ? texts.map(c => c.text).join('\n') : "";
      pendingPrompt = cleanPrompt(rawPrompt);
      
      continuations = 0;
      maxRequestInputForPrompt = 0;
      baselineTotalInput = currentTotalInput;
      baselineTotalOutput = currentTotalOutput;
      baselineTotalCached = currentTotalCached;
      baselineReasoningOutput = currentReasoningOutput;
      
      lastSeenInput = 0;
      lastSeenOutput = 0;
    }
    
    // We still track last_token_usage deduplication just to count how many API calls were made ("continuations")
    if (row.type === "event_msg" && row.payload?.type === "token_count" && row.payload?.info?.last_token_usage) {
      const usage = row.payload.info.last_token_usage;
      const inTok = usage.input_tokens || 0;
      const outTok = usage.output_tokens || 0;
      if (inTok > maxRequestInputForPrompt) {
        maxRequestInputForPrompt = inTok;
      }
      
      if (inTok !== lastSeenInput || outTok !== lastSeenOutput) {
         lastSeenInput = inTok;
         lastSeenOutput = outTok;
         continuations++;
      }
    }
  }

  if (pendingPrompt !== null) {
    const diffInput = currentTotalInput - baselineTotalInput;
    const diffOutput = currentTotalOutput - baselineTotalOutput;
    const diffCached = currentTotalCached - baselineTotalCached;
    const diffReasoning = currentReasoningOutput - baselineReasoningOutput;

    if (diffInput > 0 || diffOutput > 0) {
      queries.push({
        userPrompt: pendingPrompt,
        model: currentModel,
        reasoningLevel: currentReasoningLevel,
        inputTokens: diffInput,
        outputTokens: Math.max(0, diffOutput - diffReasoning), // don't double count
        cachedTokens: diffCached,
        reasoningTokens: diffReasoning,
        totalTokens: diffInput + diffOutput,
        requestInputTokens: maxRequestInputForPrompt,
        continuations: Math.max(0, continuations - 1)
      });
    }
  }

  return queries;
}

async function parseAllSessions() {
  const codexDir = getCodexDir();
  const dbPath = path.join(codexDir, 'state_5.sqlite');
  
  if (!fs.existsSync(dbPath)) {
    return { sessions: [], totals: {} };
  }

  // Get all threads from sqlite as the base truth
  const threads = q(`
    SELECT id, rollout_path, created_at, updated_at, model_provider, title, tokens_used, cwd
    FROM threads
    WHERE archived = 0
    ORDER BY tokens_used DESC
  `);

  const sessions = [];
  
  const dailyMap = {};
  const modelMap = {};
  const allPrompts = [];

  for (const t of threads) {
    if (!t.rollout_path || !fs.existsSync(t.rollout_path)) continue;
    
    const entries = await parseJSONLFile(t.rollout_path);
    const queries = extractSessionData(entries);
    

    const totalCacheRead = queries.reduce((sum, q) => sum + (q.cachedTokens || 0), 0);
    const totalInput = queries.reduce((sum, q) => sum + (q.inputTokens || 0), 0);
    const totalOutput = queries.reduce((sum, q) => sum + (q.outputTokens || 0), 0);
    const totalReasoning = queries.reduce((sum, q) => sum + (q.reasoningTokens || 0), 0);
    
    // Formatting local timezone date
    const localDate = new Date(t.created_at * 1000);
    const date = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    
    const durationOffset = (t.updated_at || t.created_at) - t.created_at;
    const durationStr = durationOffset > 0 ? `${(durationOffset / 60).toFixed(1)} mins` : "N/A";

    // Pick the most recent/predominant model from queries or fallback to sqlite provider
    const model = queries.length > 0 && queries[queries.length - 1].model ? queries[queries.length - 1].model : (t.model_provider || "unknown");
    // Determine the predominant reasoning level for the session
    let reasoningLevel = "none";
    if (queries.length > 0) {
      const counts = {};
      let maxCount = 0;
      let maxPriority = -1;
      const priority = { low: 1, medium: 2, high: 3, very_high: 4 };
      for (const q of queries) {
        const normalized = normalizeReasoningLevel(q.reasoningLevel);
        if (!normalized) continue;
        counts[normalized] = (counts[normalized] || 0) + 1;
        const curCount = counts[normalized];
        const curPriority = priority[normalized] || 0;
        if (curCount > maxCount || (curCount === maxCount && curPriority > maxPriority)) {
          maxCount = curCount;
          maxPriority = curPriority;
          reasoningLevel = normalized;
        }
      }
    }
    const pricing = getPricing(model);
    const totalTokens = totalInput + totalOutput + totalReasoning;
    
    const uncachedInput = Math.max(0, totalInput - totalCacheRead);
    const sessionCost = pricing.unknown ? 0 : (uncachedInput * pricing.input) + (totalCacheRead * pricing.cacheRead) + (totalOutput * pricing.output) + (totalReasoning * pricing.reasoningResult);

    sessions.push({
      sessionId: t.id,
      firstPrompt: t.title || "Untitled",
      project: t.cwd,
      createdAt: t.created_at ? (t.created_at * 1000) : null,
      updatedAt: t.updated_at ? (t.updated_at * 1000) : null,
      date: date,
      duration: durationStr,
      model: model,
      reasoningLevel: reasoningLevel,
      queryCount: queries.length,
      queries: queries,
      totalTokens: totalTokens,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cachedTokens: totalCacheRead,
      reasoningTokens: totalReasoning,
      cost: sessionCost
    });
    
    // Process Daily Usage
    if (!dailyMap[date]) {
        dailyMap[date] = { date, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0, sessions: 0, queries: 0 };
    }
    dailyMap[date].inputTokens += totalInput;
    dailyMap[date].outputTokens += totalOutput;
    dailyMap[date].cacheReadTokens += totalCacheRead;
    dailyMap[date].reasoningTokens += totalReasoning;
    dailyMap[date].totalTokens += totalTokens;
    dailyMap[date].cost += sessionCost;
    dailyMap[date].sessions += 1;
    dailyMap[date].queries += queries.length;

    // Process Model Stats and Top Prompts per-query accurately
    for (const q of queries) {
        const qModel = q.model || model; // fall back to session model
        if (!modelMap[qModel]) {
            modelMap[qModel] = { model: qModel, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0, queryCount: 0, unknownPricing: false };
        }
        
        const qPricing = getPricing(qModel);
        if (qPricing.unknown) modelMap[qModel].unknownPricing = true;
        const qUncached = Math.max(0, q.inputTokens - q.cachedTokens);
        const qCost = qPricing.unknown ? 0 : (qUncached * qPricing.input) + (q.cachedTokens * qPricing.cacheRead) + (q.outputTokens * qPricing.output) + ((q.reasoningTokens || 0) * qPricing.reasoningResult);
        
        modelMap[qModel].inputTokens += q.inputTokens;
        modelMap[qModel].outputTokens += q.outputTokens;
        modelMap[qModel].cacheReadTokens += q.cachedTokens;
        modelMap[qModel].reasoningTokens += (q.reasoningTokens || 0);
        modelMap[qModel].totalTokens += q.totalTokens;
        modelMap[qModel].cost += qCost;
        modelMap[qModel].queryCount += 1;

        if (q.totalTokens > 0) {
            allPrompts.push({
                prompt: q.userPrompt || "(No Prompt)",
                inputTokens: q.inputTokens,
                outputTokens: q.outputTokens,
                cacheReadTokens: q.cachedTokens,
                reasoningTokens: q.reasoningTokens || 0,
                totalTokens: q.totalTokens,
                cost: qCost,
                date: date,
                sessionId: t.id,
                model: qModel,
            });
        }
    }
  }

  const dailyUsage = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const modelBreakdown = Object.values(modelMap);
  
  allPrompts.sort((a, b) => b.totalTokens - a.totalTokens);
  const topPrompts = allPrompts.slice(0, 20);

  // Build per-project aggregation
  const projectMap = {};
  for (const session of sessions) {
    const proj = session.project || 'unknown';
    if (!projectMap[proj]) {
      projectMap[proj] = {
        project: proj,
        inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0,
        sessionCount: 0, queryCount: 0,
        modelMap: {},
        allPrompts: [],
      };
    }
    const p = projectMap[proj];
    p.inputTokens += session.inputTokens;
    p.outputTokens += session.outputTokens;
    p.totalTokens += session.totalTokens;
    p.cost += session.cost;
    p.sessionCount += 1;
    p.queryCount += session.queryCount;

    for (const q of session.queries) {
      if (q.model === '<synthetic>' || q.model === 'unknown') continue;
      if (!p.modelMap[q.model]) {
        p.modelMap[q.model] = { model: q.model, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, queryCount: 0 };
      }
      const m = p.modelMap[q.model];
      m.inputTokens += q.inputTokens;
      m.outputTokens += q.outputTokens;
      m.totalTokens += q.totalTokens;
      m.queryCount += 1;
    }

    let curPrompt = null, curInput = 0, curOutput = 0, curReasoning = 0, curConts = 0;
    let curModels = {};
    const flushProjectPrompt = () => {
      if (curPrompt && (curInput + curOutput + curReasoning) > 0) {
        const topModel = Object.entries(curModels).sort((a, b) => b[1] - a[1])[0]?.[0] || session.model;
        p.allPrompts.push({
          prompt: curPrompt.substring(0, 300),
          inputTokens: curInput,
          outputTokens: curOutput,
          totalTokens: curInput + curOutput + curReasoning,
          continuations: curConts,
          model: topModel,
          date: session.date,
          sessionId: session.sessionId,
        });
      }
    };
    for (const q of session.queries) {
      if (q.userPrompt && q.userPrompt !== curPrompt) {
        flushProjectPrompt();
        curPrompt = q.userPrompt;
        curInput = 0; curOutput = 0; curReasoning = 0; curConts = 0;
        curModels = {};
      } else if (!q.userPrompt) {
        curConts++;
      }
      curInput += q.inputTokens;
      curOutput += q.outputTokens;
      curReasoning += (q.reasoningTokens || 0);
      const m = q.model || session.model;
      curModels[m] = (curModels[m] || 0) + 1;
    }
    flushProjectPrompt();
  }

  const projectBreakdown = Object.values(projectMap).map(p => ({
    project: p.project,
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
    totalTokens: p.totalTokens,
    cost: p.cost,
    sessionCount: p.sessionCount,
    queryCount: p.queryCount,
    modelBreakdown: Object.values(p.modelMap).sort((a, b) => b.totalTokens - a.totalTokens),
    topPrompts: (p.allPrompts || []).sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 10),
  })).sort((a, b) => b.totalTokens - a.totalTokens);

  const totals = {
    totalSessions: sessions.length,
    totalTokens: sessions.reduce((s, c) => s + c.totalTokens, 0),
    totalQueries: sessions.reduce((s, c) => s + c.queryCount, 0),
    totalCacheReadTokens: sessions.reduce((s, c) => s + c.cachedTokens, 0),
    totalInputTokens: sessions.reduce((s, c) => s + c.inputTokens, 0),
    totalOutputTokens: sessions.reduce((s, c) => s + c.outputTokens, 0),
    totalReasoningTokens: sessions.reduce((s, c) => s + (c.reasoningTokens || 0), 0),
    dateRange: dailyUsage.length > 0
      ? { from: dailyUsage[0].date, to: dailyUsage[dailyUsage.length - 1].date }
      : null,
  };
  
  const totalUncachedInput = Math.max(0, totals.totalInputTokens - totals.totalCacheReadTokens);
  totals.totalCost = sessions.reduce((sum, s) => sum + s.cost, 0);
  totals.hasUnknownPricing = sessions.some(s => getPricing(s.model).unknown);
  totals.cacheHitRate = totals.totalInputTokens > 0 ? (totals.totalCacheReadTokens / totals.totalInputTokens) : 0;
  
  if (totals.dateRange && totals.dateRange.from && totals.dateRange.to) {
      const start = new Date(totals.dateRange.from).getTime();
      const end = new Date(totals.dateRange.to).getTime();
      const days = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
      
      const maxTime = Math.max(...sessions.map(s => s.createdAt || 0));
      // Anchor to current calendar month
      const refDate = new Date();
      
      const startOfCurrentMonth = new Date(refDate);
      startOfCurrentMonth.setDate(1);
      startOfCurrentMonth.setHours(0,0,0,0);
      
      const thisMonthSessions = sessions.filter(s => s.createdAt && new Date(s.createdAt) >= startOfCurrentMonth);
      totals.costThisMonth = thisMonthSessions.reduce((sum, s) => sum + s.cost, 0);
      
      const maxDaysInMonth = new Date(startOfCurrentMonth.getFullYear(), startOfCurrentMonth.getMonth() + 1, 0).getDate();
      const currentDayOfMonth = Math.max(1, refDate.getDate());
      totals.projectedMonthlyCost = (totals.costThisMonth / currentDayOfMonth) * maxDaysInMonth;

      // Calculate Week-over-week cost
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const lastWeekStart = maxTime - weekMs;
      const prevWeekStart = lastWeekStart - weekMs;

      const lastWeekCost = sessions.filter(s => s.createdAt > lastWeekStart).reduce((sum, s) => sum + s.cost, 0);
      const prevWeekCost = sessions.filter(s => {
        return s.createdAt > prevWeekStart && s.createdAt <= lastWeekStart;
      }).reduce((sum, s) => sum + s.cost, 0);

      if (prevWeekCost > 0) {
        const growth = ((lastWeekCost - prevWeekCost) / prevWeekCost) * 100;
        totals.weekOverWeek = (growth > 0 ? '+' : '') + growth.toFixed(0) + '%';
      } else if (lastWeekCost > 0) {
        totals.weekOverWeek = 'N/A';
      } else {
        totals.weekOverWeek = '0%';
      }
  } else {
      totals.costThisMonth = 0;
      totals.projectedMonthlyCost = 0;
      totals.weekOverWeek = 'N/A';
  }

  totals.avgTokensPerSession = totals.totalSessions > 0 ? Math.round(totals.totalTokens / totals.totalSessions) : 0;
  
  // Expose cache savings estimation for the UI
  totals.cacheSavings = sessions.reduce((sum, s) => {
    return sum + (s.queries || []).reduce((qSum, q) => {
      const p = getPricing(q.model || s.model);
      if (p.unknown) return qSum;
      return qSum + (q.cachedTokens || 0) * Math.max(0, p.input - p.cacheRead);
    }, 0);
  }, 0);

  const insights = generateInsights(sessions, allPrompts, totals);

  return {
    sessions,
    dailyUsage,
    modelBreakdown,
    topPrompts,
    totals,
    projectBreakdown,
    insights: insights
  };
}

function generateInsights(sessions, allPrompts, totals) {
  const insights = [];

  function fmt(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 10_000) return (n / 1_000).toFixed(0) + 'K';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  function modelShort(m) {
    if (!m) return 'Unknown';
    // Format: gpt-5.3-codex -> GPT 5.3 Codex
    let match = m.match(/^gpt-([\d\.]+)-codex(?:-(mini|max))?/i);
    if (match) {
      if (match[2]) {
        // gpt-5.1-codex-mini -> GPT 5.1 Mini
        const modifier = match[2].charAt(0).toUpperCase() + match[2].slice(1);
        return `GPT ${match[1]} ${modifier}`;
      }
      return `GPT ${match[1]} Codex`;
    }
    // Format: gpt-5.2 -> GPT 5.2
    match = m.match(/^gpt-([\d\.]+)/i);
    if (match) {
      return `GPT ${match[1]}`;
    }
    return m;
  }

  // 1. Long conversations getting more expensive over time
  const longSessions = sessions.filter(s => s.queries.length > 50);
  if (longSessions.length > 0) {
    const growthData = longSessions.map(s => {
      const first5 = s.queries.slice(0, 5).reduce((sum, q) => sum + q.totalTokens, 0) / Math.min(5, s.queries.length);
      const last5 = s.queries.slice(-5).reduce((sum, q) => sum + q.totalTokens, 0) / Math.min(5, s.queries.length);
      return { session: s, first5, last5, ratio: last5 / Math.max(first5, 1) };
    }).filter(g => g.ratio > 2);

    if (growthData.length > 0) {
      const avgGrowth = (growthData.reduce((s, g) => s + g.ratio, 0) / growthData.length).toFixed(1);
      const worstSession = growthData.sort((a, b) => b.ratio - a.ratio)[0];
      insights.push({
        id: 'context-growth',
        type: 'warning',
        title: 'The longer you chat, the more each message costs',
        description: `In ${growthData.length} of your conversations, the messages near the end cost ${avgGrowth}x more than the ones at the start. Why? Every time you send a message, Codex re-reads the entire conversation from the beginning. So message #5 is cheap, but message #80 is expensive because Codex is re-reading 79 previous messages plus all the code it wrote. Your longest conversation ("${worstSession.session.firstPrompt.substring(0, 50)}...") grew ${worstSession.ratio.toFixed(1)}x more expensive by the end.`,
        action: 'Start a fresh conversation when you move to a new task. If you need context from before, paste a short summary in your first message. This gives Codex a clean slate instead of re-reading hundreds of old messages.',
      });
    }
  }

  // 2. Output Optimization (The Stop Yapping Rule)
  // Replaces the old 'marathon session' to focus on high-output rewrites.
  if (sessions.length > 0) {
    const heavyWriters = sessions.filter(s => s.queryCount > 0 && (s.outputTokens / s.queryCount) > 2500);
    if (heavyWriters.length > 0) {
      const worst = heavyWriters.sort((a,b) => (b.outputTokens/b.queryCount) - (a.outputTokens/a.queryCount))[0];
      const avgOutput = Math.round(worst.outputTokens / worst.queryCount);
      insights.push({
        id: 'output-optimization',
        type: 'warning',
        title: `Codex is rewriting entire files (${fmt(avgOutput)} output tokens per turn)`,
        description: `In the session "${worst.firstPrompt.substring(0, 50)}...", Codex averaged ${fmt(avgOutput)} output tokens every time it replied. This usually means it is rewriting massive files from scratch just to change one or two lines, which drains your budget quickly.`,
        action: `Add a system rule like: "Only return the functions you changed, do not rewrite the entire file." This keeps the output tokens strictly focused on edits.`,
      });
    }
  }

  // 3. Token Burn Rate Insight
  const sessionsWithDuration = sessions.filter(s => s.duration !== "N/A" && parseFloat(s.duration) > 0);
  if (sessionsWithDuration.length > 0) {
    let topBurners = sessionsWithDuration.map(s => {
      const mins = parseFloat(s.duration);
      return { session: s, burnRate: Math.round(s.totalTokens / mins) };
    }).sort((a, b) => b.burnRate - a.burnRate);
    
    // Only show if the burn rate is actually somewhat high (>10k per minute)
    topBurners = topBurners.filter(b => b.burnRate > 10000);

    if (topBurners.length > 0) {
      const top = topBurners[0];
      insights.push({
        id: 'token-burn-rate',
        type: 'warning',
        title: `Fastest Token Burn: ${fmt(top.burnRate)} tokens per minute`,
        description: `Your highest token burn rate was during the conversation "${top.session.firstPrompt.substring(0, 50)}...". Over roughly ${top.session.duration}, you consumed ${fmt(top.session.totalTokens)} tokens, which is ${fmt(top.burnRate)} tokens per minute. High burn rates usually happen when you rapidly fire off messages in a conversation that already has a massive context history.`,
        action: 'When you are iteratively debugging (sending rapid short messages back and forth), consider starting a fresh conversation with just the relevant context. This resets the "baggage" that gets re-read every time you hit enter.',
      });
    }
  }

  // 4. Context Window Utilisation
  const modelContextLimits = {
    'gpt-5.3-codex': 128000,
    'gpt-5.2-codex': 128000,
    'gpt-5.1-codex-max': 128000,
    'gpt-5.1-codex-mini': 128000,
    'gpt-5.2': 128000
  };
  
  const nearLimitSessions = sessions.filter(s => {
    const limit = modelContextLimits[s.model.toLowerCase()] || 128000;
    // We check the peak single-request input tokens to see if it was near the limit
    if (!s.queries || s.queries.length === 0) return false;
    const peakInput = Math.max(...s.queries.map(q => q.requestInputTokens || 0));
    return peakInput > (limit * 0.8); // 80% utilisation
  });

  if (nearLimitSessions.length > 0) {
    const s = nearLimitSessions[0];
    const peakInput = Math.max(...s.queries.map(q => q.requestInputTokens || 0));
    const limit = modelContextLimits[s.model.toLowerCase()] || 128000;
    insights.push({
      id: 'context-window-limit',
      type: 'warning',
      title: `Approaching context window limits (${((peakInput/limit)*100).toFixed(0)}% full)`,
      description: `In ${nearLimitSessions.length === 1 ? 'one conversation' : nearLimitSessions.length + ' conversations'} (like "${s.firstPrompt.substring(0, 50)}..."), your context reached ${fmt(peakInput)} tokens in a single request. The absolute limit for ${modelShort(s.model)} is ${fmt(limit)}. As you approach the limit, the model may forget earlier instructions or begin ignoring files.`,
      action: 'Close unused files in your IDE and aggressively start new conversations when tackling distinct sub-tasks. Codex works best when its context window is focused only on what is strictly necessary.',
    });
  }

  // 4. Reasoning ROI Analyzer (High Effort on Short Prompts)
  const allQueries = sessions.flatMap(s => s.queries || []);
  const highReasoningQueries = allQueries.filter(q => {
    const level = normalizeReasoningLevel(q.reasoningLevel);
    return level === 'high' || level === 'very_high';
  });
  
  if (highReasoningQueries.length > 0) {
    // Find queries where prompt is very short but reasoning is very high
    const lowROIPrompts = highReasoningQueries.filter(q => 
      q.userPrompt && wordCount(q.userPrompt) < 20 && q.reasoningTokens > 2000
    );
    
    if (lowROIPrompts.length > 5) {
      const wastedTokens = lowROIPrompts.reduce((sum, q) => sum + q.reasoningTokens, 0);
      insights.push({
        id: 'reasoning-roi',
        type: 'warning',
        title: `Low ROI on "High" Reasoning Effort (${fmt(wastedTokens)} tokens)`,
        description: `You have ${lowROIPrompts.length} recent prompts that were very short (under 20 words) but generated over 2,000 hidden reasoning tokens each while using high or very high reasoning effort. For example, asking "${lowROIPrompts[0].userPrompt.substring(0, 30)}..." burned massive reasoning tokens. High reasoning effort is charged as output tokens and gets expensive quickly.`,
        action: `Switch Codex to "Low" reasoning effort for quick formatting requests, simple questions, or small targeted edits. Only use "High" effort for complex architectural design or tough bug fixing.`,
      });
    }
  }

  // 5. The Tab Hoarder Warning (Massive baselines)
  const massiveBaselines = sessions.filter(s => s.queries && s.queries.length > 0 && s.queries[0].inputTokens > 50000);
  if (massiveBaselines.length > 3) {
    const avgStart = Math.round(massiveBaselines.reduce((sum, s) => sum + s.queries[0].inputTokens, 0) / massiveBaselines.length);
    insights.push({
      id: 'tab-hoarder',
      type: 'warning',
      title: `You might be a Tab Hoarder (Avg Start: ${fmt(avgStart)} tokens)`,
      description: `In ${massiveBaselines.length} recent conversations, your very first message sent over ${fmt(avgStart)} input tokens to Codex. This usually happens when you have dozens of files open in your IDE, so Codex is forced to read all of them every time you ask a question.`,
      action: `Close unused files and tabs before starting a new conversation. This dramatically reduces your base input token cost and speeds up Codex's response time by giving it less noise to sift through.`,
    });
  }

  // 6. Maximize Cache Hits
  if (totals.totalInputTokens > 0) {
    const cachePct = (totals.totalCacheReadTokens / totals.totalInputTokens) * 100;
    if (cachePct < 50) {
      insights.push({
        id: 'cache-optimization',
        type: 'info',
        title: `Your cache hit rate is only ${cachePct.toFixed(0)}%`,
        description: `Codex offers a massive 90% discount on "cached" input tokens. Currently, out of ${fmt(totals.totalInputTokens)} total input tokens, only ${fmt(totals.totalCacheReadTokens)} were served from cache. This means you are paying full price for heavily repetitive context.`,
        action: 'To maximize cache hits, keep your system prompts and large files at the beginning of the context, and only add new messages to the end. Modifying files that were included early in the conversation will invalidate the cache.',
      });
    }
  }

  // 7. Night Owl / Time-of-Day Habits
  if (totals.totalTokens > 0 && sessions.length > 5) {
    let lateNightTokens = 0;
    let totalTimeTokens = 0;
    sessions.forEach(s => {
      const ts = s.createdAt || s.updatedAt;
      if (ts) {
        const dt = new Date(ts);
        const hour = dt.getHours();
        totalTimeTokens += s.totalTokens;
        if (hour >= 22 || hour < 4) { // 10 PM to 4 AM
          lateNightTokens += s.totalTokens;
        }
      }
    });
    
    if (totalTimeTokens > 0) {
      const nightPct = (lateNightTokens / totalTimeTokens) * 100;
      if (nightPct > 40) {
        insights.push({
          id: 'night-owl',
          type: 'info',
          title: `You are a Night Owl! (${nightPct.toFixed(0)}% late-night usage)`,
          description: `Most of your heavy lifting happens when the sun goes down. Exactly ${nightPct.toFixed(0)}% of your total Codex token usage (${fmt(lateNightTokens)} tokens) happens between 10:00 PM and 4:00 AM.`,
          action: `Late night coding sessions can lead to marathon context windows. Remember to start fresh conversations if you switch topics deep into the night to avoid dragging huge memory payloads.`,
        });
      }
    }
  }



  return insights;
}
module.exports = { parseAllSessions };
