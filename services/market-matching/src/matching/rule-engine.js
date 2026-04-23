const DEFAULT_RULES = [
  { keywords: ['federal reserve', 'fomc', 'interest rate', 'rate hike', 'rate cut'], markets: ['FED-RATE-DECISION'] },
  { keywords: ['cpi', 'inflation', 'consumer price'], markets: ['CPI-MONTHLY'] },
  { keywords: ['unemployment', 'jobs report', 'nonfarm payrolls'], markets: ['JOBS-MONTHLY'] },
  { keywords: ['supreme court', 'scotus'], markets: ['SCOTUS-RULING'] },
  { keywords: ['government shutdown'], markets: ['SHUTDOWN-2026'] },
]

function norm(text) {
  return (text ?? '').toLowerCase()
}

export function createRuleEngine(rules = DEFAULT_RULES) {
  function match(article) {
    const haystack = `${norm(article.title)} ${norm(article.summary)} ${norm(article.body)}`
    for (const rule of rules) {
      if (rule.keywords.some((kw) => haystack.includes(norm(kw)))) {
        return rule.markets
      }
    }
    return null
  }
  return { match, rules }
}
