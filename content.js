(function () {
  'use strict';

  if (window.linkedInExporterLoaded) return;
  window.linkedInExporterLoaded = true;

  const SELECTORS = {
    jobTitle: [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.t-24.t-bold.inline'
    ],
    companyName: [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name'
    ],
    location: [
      '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text',
      '.jobs-unified-top-card__tertiary-description-container .tvm__text',
      '.job-details-jobs-unified-top-card__primary-description-container .t-black--light',
      '.jobs-unified-top-card__primary-description-container .t-black--light',
      '.jobs-unified-top-card__bullet'
    ],
    locationContainer: [
      '.job-details-jobs-unified-top-card__tertiary-description-container',
      '.jobs-unified-top-card__tertiary-description-container',
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__primary-description-container'
    ],
    jobDescription: ['.jobs-description__content', '.jobs-box__html-content', '#job-details']
  };

  const EXPAND_CONTROL_SELECTORS = [
    'button[aria-label*="show more" i]',
    'button[aria-label*="see more" i]',
    'button[aria-label*="description" i]',
    'button[aria-label*="显示更多"]',
    'button[aria-label*="展开"]',
    'button.jobs-description__footer-button',
    'a[role="button"][aria-label*="show more" i]'
  ];

  const EXPAND_TEXT_PATTERNS = [/show more/i, /see more/i, /read more/i, /显示更多/, /展开/, /查看更多/];
  const COLLAPSE_TEXT_PATTERNS = [/show less/i, /see less/i, /collapse/i, /收起/, /隐藏/];

  const DESCRIPTION_NOISE_SELECTORS = [
    '[aria-hidden="true"]',
    '.visually-hidden',
    '.sr-only',
    '[style*="display: none"]',
    '[hidden]',
    'script',
    'style',
    'noscript',
    'template',
    'button',
    'input',
    'textarea',
    'select'
  ].join(', ');

  const SECTION_HEADING_LABELS = [
    'About the job',
    'About the role',
    'About the team',
    'About the position',
    'About us',
    'About you',
    'Overview',
    'Job Summary',
    'Summary',
    'Role',
    'The Role',
    'The Opportunity',
    'What you will do',
    "What you'll do",
    'What you\u2019ll do',
    'What you will bring',
    "What you'll bring",
    'What you\u2019ll bring',
    'What we offer',
    'What we are looking for',
    "What we're looking for",
    'What we\u2019re looking for',
    'What to expect during the interview process',
    'What do you need to succeed',
    'Day to day',
    'The Team',
    'Our Culture',
    'Key Responsibilities',
    'Responsibilities',
    'Duties',
    'Requirements',
    'Qualifications',
    'Required Qualifications',
    'Minimum Qualifications',
    'Basic Qualifications',
    'Preferred Qualifications',
    'Required Skills',
    'Preferred Skills',
    'Must Have',
    'Nice to Have',
    'Who You Are',
    'Required Knowledge, Skills And Abilities',
    'Benefits',
    'Compensation',
    'Salary',
    'Pay',
    'Pay Transparency',
    'Total Rewards',
    'Schedule',
    'Additional Details',
    'Disclaimer',
    'Equal Opportunity Statement'
  ];

  function escapeRegex(source) {
    return String(source || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const SECTION_HEADING_PATTERNS = SECTION_HEADING_LABELS.map((heading) => {
    const source = escapeRegex(heading).replace(/\s+/g, '\\s+');
    return {
      heading,
      inlinePattern: new RegExp(`^(${source})(?:\\s*[:\\-])?\\s+(.+)$`, 'i'),
      exactPattern: new RegExp(`^${source}$`, 'i')
    };
  });

  // ---------------------------------------------------------------------------
  // Layer 1: Turndown.js configuration
  // ---------------------------------------------------------------------------

  const turndownAvailable = typeof TurndownService !== 'undefined';
  let turndownService = null;

  if (turndownAvailable) {
    turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      hr: '---',
      strongDelimiter: '**',
      emDelimiter: '*'
    });

    turndownService.addRule('removeHidden', {
      filter: function (node) {
        if (!node.getAttribute) return false;
        return (
          node.getAttribute('aria-hidden') === 'true' ||
          (node.classList &&
            (node.classList.contains('visually-hidden') || node.classList.contains('sr-only'))) ||
          (node.getAttribute('style') && /display:\s*none/i.test(node.getAttribute('style'))) ||
          node.hasAttribute('hidden')
        );
      },
      replacement: function () {
        return '';
      }
    });

    turndownService.addRule('removeInteractive', {
      filter: ['button', 'input', 'textarea', 'select', 'script', 'style', 'noscript', 'template'],
      replacement: function () {
        return '';
      }
    });

    // Strip links but keep text (LinkedIn internal links add noise)
    turndownService.addRule('stripLinks', {
      filter: 'a',
      replacement: function (content) {
        return content;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Utility functions
  // ---------------------------------------------------------------------------

  function findElement(selectorList) {
    for (const selector of selectorList) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function getTextContent(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('[aria-hidden="true"], .visually-hidden, .sr-only, [style*="display: none"]').forEach((el) => {
      el.remove();
    });
    return String(clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function extractLocation() {
    const directLocationEl = findElement(SELECTORS.location);
    const directLocationText = getTextContent(directLocationEl);
    if (directLocationText) {
      return directLocationText.split(/[·•|]/)[0].trim();
    }

    const locationContainerEl = findElement(SELECTORS.locationContainer);
    const locationContainerText = getTextContent(locationContainerEl);
    if (locationContainerText) {
      return locationContainerText.split(/[·•|]/)[0].trim();
    }

    return '';
  }

  function extractJobIdFromRawUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      const pathMatch = url.pathname.match(/\/jobs\/view\/(\d+)/);
      if (pathMatch) return pathMatch[1];
      const queryMatch = url.searchParams.get('currentJobId') || url.searchParams.get('jobId');
      if (/^\d+$/.test(String(queryMatch || '').trim())) return String(queryMatch).trim();
    } catch (_error) {
      // Best effort below.
    }

    const pathMatch = String(rawUrl || '').match(/\/jobs\/view\/(\d+)/);
    if (pathMatch) return pathMatch[1];
    return '';
  }

  function toStablePageUrl(rawUrl, jobId) {
    try {
      const url = new URL(rawUrl, location.href);
      if (/^\d+$/.test(String(jobId || '').trim())) {
        return `${url.origin}/jobs/view/${jobId}/`;
      }
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch (_error) {
      return String(rawUrl || '').split('#')[0];
    }
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function waitForDescriptionElement(timeoutMs = 2200) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const element = findElement(SELECTORS.jobDescription);
      if (element) return element;
      await delay(120);
    }
    return findElement(SELECTORS.jobDescription);
  }

  function isElementVisible(element) {
    if (!element || typeof element.getClientRects !== 'function') return false;
    return element.getClientRects().length > 0;
  }

  function matchesExpandControl(element) {
    const text = [
      element.textContent || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || ''
    ].join(' ');

    if (!text) return false;
    if (COLLAPSE_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return false;
    return EXPAND_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  }

  function collectExpandCandidates(descriptionElement) {
    const candidates = new Set();
    for (const selector of EXPAND_CONTROL_SELECTORS) {
      descriptionElement.querySelectorAll(selector).forEach((el) => candidates.add(el));
      document.querySelectorAll(selector).forEach((el) => candidates.add(el));
    }

    descriptionElement.querySelectorAll('button, a[role="button"], span[role="button"]').forEach((el) => {
      if (matchesExpandControl(el)) candidates.add(el);
    });
    document.querySelectorAll('button, a[role="button"], span[role="button"]').forEach((el) => {
      if (matchesExpandControl(el)) candidates.add(el);
    });
    return candidates;
  }

  function getDescriptionLength(element) {
    return String(element?.innerText || element?.textContent || '').trim().length;
  }

  async function expandJobDescriptionIfNeeded() {
    const descriptionElement = await waitForDescriptionElement();
    if (!descriptionElement) return false;

    let clickedAny = false;
    let previousLength = getDescriptionLength(descriptionElement);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const currentElement = findElement(SELECTORS.jobDescription) || descriptionElement;
      try {
        currentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_error) {
        // Ignore if scroll fails.
      }

      const candidates = collectExpandCandidates(currentElement);
      let clickedThisRound = false;
      for (const candidate of candidates) {
        if (!isElementVisible(candidate) || candidate.disabled) continue;
        const ariaExpanded = String(candidate.getAttribute('aria-expanded') || '').toLowerCase();
        if (ariaExpanded === 'true') continue;
        try {
          candidate.click();
          clickedThisRound = true;
          clickedAny = true;
        } catch (_error) {
          // Ignore and keep trying.
        }
      }

      await delay(260 + attempt * 120);
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

      const nextElement = findElement(SELECTORS.jobDescription) || currentElement;
      const currentLength = getDescriptionLength(nextElement);
      const grew = currentLength > previousLength + 20;
      previousLength = Math.max(previousLength, currentLength);

      if (!clickedThisRound && !grew) break;
    }

    return clickedAny;
  }

  // ---------------------------------------------------------------------------
  // Layer 2: Post-processing (LinkedIn-specific fixes)
  // ---------------------------------------------------------------------------

  // Fix 2.1: Rejoin year/salary ranges split across lines
  function rejoinSplitRanges(text) {
    // "3\n- 5+ years" → "3-5+ years"
    let result = text.replace(/(\d{1,6})\n- (\d)/g, '$1-$2');
    // "CAD $90K\n- CAD $140K" → "CAD $90K - CAD $140K"
    result = result.replace(/([\d,.]+[KkMm]?)\n- (\$?[A-Z]{0,4}\s*\$?[\d,.]+)/g, '$1 - $2');
    return result;
  }

  // Fix 2.2: Rejoin headings split by conjunctions
  function rejoinSplitHeadings(text) {
    // "## Required Skills\n\n&\n\nExperience:" → "## Required Skills & Experience:"
    return text.replace(/(## [^\n]+)\n\n([&]|and|or)\n\n([A-Z][^\n]*)/gi, '$1 $2 $3');
  }

  // Fix 2.3: Fix false heading fragments
  function fixFalseHeadingFragments(text) {
    const falseEndingWords = /\b(OF|THE|IS|TO|IN|FOR|A|AN|AND|OR|WITH|AT)\s*$/i;
    const lines = text.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch && falseEndingWords.test(headingMatch[2])) {
        const headingText = headingMatch[2];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;

        if (j < lines.length && !lines[j].startsWith('#')) {
          result.push(headingText + ' ' + lines[j].trim());
          i = j;
          continue;
        }
      }

      result.push(line);
    }

    return result.join('\n');
  }

  // Fix 2.4: Split concatenated sentences (missing spaces after period)
  function splitConcatenatedSentences(text) {
    return text.replace(/([a-z)])\.([A-Z])/g, '$1.\n$2');
  }

  // Fix 2.5: Detect and split concatenated headings in plain text
  function splitConcatenatedHeadings(text) {
    let result = text;
    for (const label of SECTION_HEADING_LABELS) {
      const escaped = escapeRegex(label);
      const re = new RegExp(`([a-z.!?)])\\s*(${escaped})(?=\\s|:|$)`, 'gmi');
      result = result.replace(re, '$1\n\n## $2\n');
    }
    return result;
  }

  // Fix 2.6: HTML entity decoding
  function decodeHtmlEntities(text) {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  }

  // Fix 2.9: Clean up broken bold/italic markers from Turndown
  // Turndown sometimes produces orphaned ** when <strong> wraps across block elements
  function cleanBrokenMarkdownMarkers(text) {
    let result = text;
    // Remove lines that are just ** or ****
    result = result.replace(/^\*{2,}$/gm, '');
    // Fix "**text\n\n**continuation" → "text\ncontinuation"
    // (orphaned opening ** at end of line followed by orphaned closing ** at start of next content)
    result = result.replace(/\*\*([^\n*]+)\n\n\*\*/g, '$1\n\n');
    // Fix "**\n**text" → "text" (empty bold followed by bold start)
    result = result.replace(/\*\*\s*\n\*\*([^\n*]+)/g, '$1');
    // Fix "****text" → "text" (doubled bold markers)
    result = result.replace(/\*{4,}/g, '');
    // Remove orphaned ** at start of line (not followed by closing **)
    result = result.replace(/^\*\*(?!\*)/gm, '');
    // Remove orphaned ** at end of line (not preceded by opening **)
    result = result.replace(/(?<!\*)\*\*$/gm, '');
    return result;
  }

  // Fix 2.7: Split long wall-of-text lines at camelCase-like word boundaries
  // "productsPartner with..." → "products\nPartner with..."
  // Only applied to lines >150 chars to avoid splitting legitimate compound words
  const COMPOUND_WORD_RE = /JavaScript|TypeScript|LinkedIn|GitHub|GitLab|YouTube|WordPress|NoSQL|GraphQL|PostgreSQL|iPhone|iPad|macOS|iOS|GenAI|DevOps|DataOps|MLOps|QuickBooks|MongoDB|DynamoDB|PowerBI|IntelliJ|eBay|eCommerce|OutSystems|DocuSign|SalesForce|HubSpot|CyberArk|ServiceNow|NetSuite|PeopleSoft/i;

  function splitConcatenatedWords(text) {
    return text.split('\n').map((line) => {
      if (line.length <= 150) return line;
      return line.replace(/([a-z]{2,})([A-Z][a-z]{2,})/g, (match, before, after, offset) => {
        const ctx = line.substring(Math.max(0, offset - 10), Math.min(line.length, offset + match.length + 5));
        if (COMPOUND_WORD_RE.test(ctx)) return match;
        return before + '\n' + after;
      });
    }).join('\n');
  }

  // Fix 2.8: Split at colon boundaries without space
  // "Salary:$75,900" → "Salary: $75,900"
  // "Pay Type:SalariedThe above..." → "Pay Type: Salaried\nThe above..."
  function splitColonConcatenated(text) {
    // Add space after colon when followed by $ or digit
    let result = text.replace(/([A-Za-z]):(\$|\d)/g, '$1: $2');
    // Split "word:CapitalizedWord" where colon has no space
    result = result.replace(/([a-z]):([A-Z][a-z])/g, '$1:\n$2');
    return result;
  }

  function postProcessMarkdown(text) {
    let result = text;
    result = cleanBrokenMarkdownMarkers(result);
    result = rejoinSplitRanges(result);
    result = rejoinSplitHeadings(result);
    result = fixFalseHeadingFragments(result);
    result = splitConcatenatedSentences(result);
    result = splitColonConcatenated(result);
    result = splitConcatenatedWords(result);
    result = decodeHtmlEntities(result);
    result = result.replace(/\n{3,}/g, '\n\n');
    return result.trim();
  }

  // ---------------------------------------------------------------------------
  // Heading detection and spacing (shared by Layer 1+2)
  // ---------------------------------------------------------------------------

  // Short heading labels that are also common English words — only promote to
  // heading when they appear with a colon suffix or preceded by a blank line
  // AND followed by substantive content (not a sentence continuation).
  const AMBIGUOUS_HEADING_LABELS = new Set([
    'role', 'summary', 'pay', 'salary', 'compensation',
    'benefits', 'schedule', 'duties', 'overview', 'disclaimer'
  ]);

  function isKnownHeadingLine(text) {
    const line = String(text || '').trim();
    if (!line) return false;
    const matched = SECTION_HEADING_PATTERNS.some((candidate) => candidate.exactPattern.test(line));
    if (!matched) return false;
    // For ambiguous single-word labels, require a colon suffix to confirm heading intent
    if (AMBIGUOUS_HEADING_LABELS.has(line.toLowerCase().replace(/[:\s]+$/, ''))) {
      return /:\s*$/.test(line);
    }
    return true;
  }

  function splitHeadingLine(text) {
    const line = String(text || '').trim();
    if (!line) return null;

    for (const candidate of SECTION_HEADING_PATTERNS) {
      const match = line.match(candidate.inlinePattern);
      if (match) {
        return {
          heading: candidate.heading,
          body: String(match[2] || '').trim()
        };
      }
    }

    const genericMatch = line.match(/^([A-Z][A-Za-z0-9&/,\u2018\u2019()\- ]{2,70}):\s+(.+)$/);
    if (genericMatch) {
      return {
        heading: String(genericMatch[1] || '').trim(),
        body: String(genericMatch[2] || '').trim()
      };
    }

    const keywordInlineMatch = line.match(
      /^(Responsibilities|Qualifications|Requirements|Benefits|Compensation|What you will do|What you'll do|What you\u2019ll do|Preferred Qualifications|Required Qualifications|Minimum Qualifications|Must Have|Nice to Have)(?:\s*[:\-])?\s+(.+)$/i
    );
    if (keywordInlineMatch) {
      return {
        heading: String(keywordInlineMatch[1] || '').trim(),
        body: String(keywordInlineMatch[2] || '').trim()
      };
    }

    return null;
  }

  function enforceHeadingSpacing(text) {
    const sourceLines = String(text || '')
      .split('\n')
      .map((line) => String(line || '').trimEnd());
    const output = [];

    for (let i = 0; i < sourceLines.length; i++) {
      const line = sourceLines[i].trim();
      if (!line) {
        if (output.length > 0 && output[output.length - 1] !== '') {
          output.push('');
        }
        continue;
      }

      // Check lines already formatted as headings — but validate them
      const existingHeadingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (existingHeadingMatch) {
        const headingText = existingHeadingMatch[2].trim();
        // Check if this "heading" is actually a sentence continuation:
        // If the previous non-blank line ends without punctuation (no . ! ? :)
        // and this heading text starts with a lowercase-like word or is ambiguous,
        // it's likely a false heading from Turndown.
        const prevContent = output.length > 0 ? output[output.length - 1] : '';
        const prevEndsWithoutPunctuation = prevContent && !/[.!?:]\s*$/.test(prevContent) && prevContent !== '';
        const isAmbiguous = AMBIGUOUS_HEADING_LABELS.has(headingText.toLowerCase().replace(/[:\s]+$/, ''));

        if (prevEndsWithoutPunctuation && isAmbiguous) {
          // Find next non-blank line to check if it's a continuation
          let nextContent = '';
          for (let j = i + 1; j < sourceLines.length; j++) {
            const nl = sourceLines[j].trim();
            if (nl) { nextContent = nl; break; }
          }
          const nextStartsLowercase = nextContent && /^[a-z]/.test(nextContent);

          if (nextStartsLowercase) {
            // This is a false heading — rejoin with previous line
            if (output.length > 0 && output[output.length - 1] === '') output.pop();
            if (output.length > 0) {
              output[output.length - 1] += ' ' + headingText;
            } else {
              output.push(headingText);
            }
            continue;
          }
        }

        if (output.length > 0 && output[output.length - 1] !== '') output.push('');
        output.push(line);
        output.push('');
        continue;
      }

      const split = splitHeadingLine(line);
      if (split) {
        if (output.length > 0 && output[output.length - 1] !== '') output.push('');
        output.push(`## ${split.heading}`);
        output.push('');
        if (split.body) output.push(split.body);
        continue;
      }

      const isHeading = isKnownHeadingLine(line);
      if (isHeading) {
        if (output.length > 0 && output[output.length - 1] !== '') output.push('');
        output.push(`## ${line}`);
        output.push('');
        continue;
      }

      output.push(line);
    }

    // Rejoin orphan continuation lines: if a line starts with lowercase
    // and the previous line is not blank, it's likely a sentence continuation
    const rejoined = [];
    for (const line of output) {
      if (
        rejoined.length > 0 &&
        /^[a-z]/.test(line) &&
        rejoined[rejoined.length - 1] !== '' &&
        !rejoined[rejoined.length - 1].startsWith('-') &&
        !rejoined[rejoined.length - 1].startsWith('#')
      ) {
        rejoined[rejoined.length - 1] += ' ' + line;
        continue;
      }
      rejoined.push(line);
    }

    while (rejoined.length > 0 && rejoined[rejoined.length - 1] === '') {
      rejoined.pop();
    }

    const compact = [];
    for (const line of rejoined) {
      if (line === '' && (compact.length === 0 || compact[compact.length - 1] === '')) continue;
      compact.push(line);
    }

    return compact.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Quality scoring
  // ---------------------------------------------------------------------------

  function scoreMarkdownQuality(text) {
    const value = String(text || '').trim();
    if (!value) return -1;

    const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
    const bulletLines = lines.filter((line) => /^(-|\*|\d+\.)\s+/.test(line)).length;
    const headingLines = lines.filter((line) => /^#{1,6}\s+/.test(line)).length;
    const longLines = lines.filter((line) => line.length > 220).length;
    const uniqueLineRatio = lines.length === 0 ? 0 : new Set(lines.map((line) => line.toLowerCase())).size / lines.length;

    return (
      value.length * 0.01 +
      lines.length * 0.5 +
      bulletLines * 3 +
      headingLines * 2 -
      longLines * 2 +
      uniqueLineRatio * 4
    );
  }

  // ---------------------------------------------------------------------------
  // JSON-LD extraction
  // ---------------------------------------------------------------------------

  function flattenJsonLdNodes(input, out) {
    if (!input) return;
    if (Array.isArray(input)) {
      for (const item of input) flattenJsonLdNodes(item, out);
      return;
    }
    if (typeof input !== 'object') return;

    out.push(input);
    if (Array.isArray(input['@graph'])) {
      flattenJsonLdNodes(input['@graph'], out);
    }
  }

  function extractDescriptionHtmlFromJsonLd() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const allNodes = [];

    for (const script of scripts) {
      const raw = String(script.textContent || '').trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        flattenJsonLdNodes(parsed, allNodes);
      } catch (_error) {
        // Ignore malformed JSON-LD blocks.
      }
    }

    const jobPostingNode = allNodes.find((node) => {
      const type = node?.['@type'];
      if (Array.isArray(type)) return type.some((v) => String(v).toLowerCase() === 'jobposting');
      return String(type || '').toLowerCase() === 'jobposting';
    });

    if (!jobPostingNode) return '';
    return String(jobPostingNode.description || '').trim();
  }

  // ---------------------------------------------------------------------------
  // Plain-text fallback (when Turndown is not available)
  // ---------------------------------------------------------------------------

  function formatPlainTextFallback(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.querySelectorAll(DESCRIPTION_NOISE_SELECTORS).forEach((el) => el.remove());
    let text = String(wrapper.innerText || wrapper.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    if (!text) return '';

    text = text.replace(/\s*[•▪◦○►▸➤➜–]\s*/g, '\n- ');

    for (const heading of SECTION_HEADING_LABELS) {
      const src = escapeRegex(heading).replace(/\s+/g, '\\s+');
      const re = new RegExp(`(^|[\\n\\r]|[.!?]\\s+)(\\s*(${src}))(?=\\s|:|$)`, 'gi');
      text = text.replace(re, (_match, prefix, headingText) => `${prefix}\n\n${headingText.trim()}\n`);
    }

    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  // ---------------------------------------------------------------------------
  // Description extraction pipeline (Layer 1 + Layer 2)
  // ---------------------------------------------------------------------------

  function extractDescriptionMarkdown(descriptionElement) {
    const candidates = [];

    // Candidate 1: Turndown from DOM element
    if (descriptionElement && turndownService) {
      const clone = descriptionElement.cloneNode(true);
      clone.querySelectorAll(DESCRIPTION_NOISE_SELECTORS).forEach((el) => el.remove());
      try {
        const md = turndownService.turndown(clone.innerHTML);
        if (md.trim()) candidates.push(md);
      } catch (_error) {
        // Turndown failed; fall through to other candidates.
      }
    }

    // Candidate 2: Turndown from JSON-LD HTML
    const jsonLdHtml = extractDescriptionHtmlFromJsonLd();
    if (jsonLdHtml && turndownService) {
      try {
        const md = turndownService.turndown(jsonLdHtml);
        if (md.trim()) candidates.push(md);
      } catch (_error) {
        // Ignore.
      }
    }

    // Candidate 3: Plain-text fallback from DOM
    if (descriptionElement && candidates.length === 0) {
      const clone = descriptionElement.cloneNode(true);
      clone.querySelectorAll(DESCRIPTION_NOISE_SELECTORS).forEach((el) => el.remove());
      const fallback = String(clone.innerText || clone.textContent || '').trim();
      if (fallback) candidates.push(fallback);
    }

    // Candidate 4: Plain-text fallback from JSON-LD
    if (jsonLdHtml && candidates.length === 0) {
      const fallback = formatPlainTextFallback(jsonLdHtml);
      if (fallback) candidates.push(fallback);
    }

    // Apply Layer 2 post-processing + heading enforcement to all candidates
    const processed = candidates
      .map((c) => postProcessMarkdown(c))
      .filter(Boolean);

    const unique = Array.from(new Set(processed.map((t) => t.trim()).filter(Boolean)));
    if (unique.length === 0) return 'Job description not found';

    unique.sort((a, b) => scoreMarkdownQuality(b) - scoreMarkdownQuality(a));
    return unique[0];
  }

  // ---------------------------------------------------------------------------
  // Layer 3: Gemini integration (optional)
  // ---------------------------------------------------------------------------

  const GEMINI_QUALITY_THRESHOLD = 30;

  async function getGeminiSettings() {
    try {
      const result = await chrome.storage.local.get('geminiSettings');
      return result?.geminiSettings || { apiKey: '', mode: 'off' };
    } catch (_error) {
      return { apiKey: '', mode: 'off' };
    }
  }

  async function requestGeminiReformat(rawText, jobTitle) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GEMINI_REFORMAT', rawText, jobTitle },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.ok && response.reformatted) {
            resolve(response.reformatted);
          } else {
            reject(new Error(response?.message || 'Gemini reformat failed'));
          }
        }
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Main extraction orchestrator (Layer 1 + 2 + 3)
  // ---------------------------------------------------------------------------

  async function extractStructuredDescriptionText(descriptionElement) {
    // Layer 1 + Layer 2
    const markdown = extractDescriptionMarkdown(descriptionElement);

    // Layer 3: Gemini (optional)
    try {
      const settings = await getGeminiSettings();
      if (settings.apiKey && settings.mode !== 'off') {
        const quality = scoreMarkdownQuality(markdown);
        if (settings.mode === 'always' || (settings.mode === 'auto' && quality < GEMINI_QUALITY_THRESHOLD)) {
          const jobTitle = getTextContent(findElement(SELECTORS.jobTitle)) || '';
          const reformatted = await requestGeminiReformat(markdown, jobTitle);
          if (reformatted && scoreMarkdownQuality(reformatted) > quality) {
            return reformatted;
          }
        }
      }
    } catch (_error) {
      // Gemini is optional — continue with Layer 1+2 output.
    }

    return markdown;
  }

  async function extractJobDescriptionText() {
    const jobDescEl = findElement(SELECTORS.jobDescription);
    return await extractStructuredDescriptionText(jobDescEl);
  }

  async function getCurrentJobInfo() {
    const jobTitle = getTextContent(findElement(SELECTORS.jobTitle)) || 'Unknown Position';
    const companyName = getTextContent(findElement(SELECTORS.companyName)) || 'Unknown Company';
    const locationText = extractLocation() || 'Unknown Location';
    const rawUrl = location.href;
    const jobId = extractJobIdFromRawUrl(rawUrl);

    return {
      jobTitle,
      companyName,
      location: locationText,
      jobDescriptionText: await extractJobDescriptionText(),
      jobId,
      jobUrl: toStablePageUrl(rawUrl, jobId)
    };
  }

  // ---------------------------------------------------------------------------
  // Toast notification
  // ---------------------------------------------------------------------------

  function showToast(message, isError) {
    let toast = document.getElementById('linkedin-job-tracker-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'linkedin-job-tracker-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = isError ? 'linkedin-job-tracker-toast linkedin-job-tracker-toast-error' : 'linkedin-job-tracker-toast';

    window.setTimeout(() => {
      if (toast) {
        toast.className = 'linkedin-job-tracker-toast linkedin-job-tracker-toast-hidden';
      }
    }, 2200);
  }

  // ---------------------------------------------------------------------------
  // File download
  // ---------------------------------------------------------------------------

  function triggerTxtDownload(fileName, textContent) {
    const safeName = String(fileName || '').trim() || 'linkedin_job_description.txt';
    const content = String(textContent || '');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeName;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error?.message || 'Failed to trigger page download.' };
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  }

  // ---------------------------------------------------------------------------
  // OneClick Job Tracker auto-trigger integration
  // ---------------------------------------------------------------------------

  const ONECLICK_BUTTON_RE = /\boneclick\b/i;
  const ONECLICK_BUTTON_MAX_LABEL_LENGTH = 80;

  const ONECLICK_DEBOUNCE_MS = 5000;
  let lastOneClickTriggeredJobKey = null;
  let lastOneClickTriggeredAt = 0;

  function getElementSearchableLabel(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    return [
      element.getAttribute('aria-label') || '',
      element.getAttribute('title') || '',
      element.textContent || ''
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function isInteractiveButtonLikeElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = String(element.tagName || '').toUpperCase();
    return tag === 'BUTTON' || tag === 'A' || element.getAttribute('role') === 'button';
  }

  function isOneClickButton(element) {
    if (!isInteractiveButtonLikeElement(element)) return false;
    const label = getElementSearchableLabel(element);
    if (!label || label.length > ONECLICK_BUTTON_MAX_LABEL_LENGTH) return false;
    return ONECLICK_BUTTON_RE.test(label);
  }

  function getOneClickJobKey() {
    const rawUrl = location.href;
    const jobId = extractJobIdFromRawUrl(rawUrl);
    return jobId || rawUrl;
  }

  function shouldDebounceOneClick() {
    const jobKey = getOneClickJobKey();
    const now = Date.now();
    if (jobKey === lastOneClickTriggeredJobKey && now - lastOneClickTriggeredAt < ONECLICK_DEBOUNCE_MS) {
      return true;
    }
    return false;
  }

  function markOneClickTriggered() {
    lastOneClickTriggeredJobKey = getOneClickJobKey();
    lastOneClickTriggeredAt = Date.now();
  }

  async function isOneClickAutoEnabled() {
    try {
      const result = await chrome.storage.local.get('oneclickAutoSettings');
      const settings = result?.oneclickAutoSettings;
      return settings?.enabled !== false;
    } catch (_error) {
      return true;
    }
  }

  async function triggerOneClickAutoExport() {
    if (shouldDebounceOneClick()) return;

    const enabled = await isOneClickAutoEnabled();
    if (!enabled) return;

    markOneClickTriggered();

    try {
      chrome.runtime.sendMessage({
        type: 'ONECLICK_TRIGGERED',
        jobKey: getOneClickJobKey(),
        url: location.href
      });
    } catch (_error) {
      // Non-blocking — background may not be ready.
    }
  }

  function setupOneClickClickListener() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

      let candidate = target;
      for (let i = 0; i < 4 && candidate && candidate !== document.body; i += 1) {
        if (isOneClickButton(candidate)) {
          window.setTimeout(() => {
            triggerOneClickAutoExport();
          }, 800);
          return;
        }
        candidate = candidate.parentElement;
      }
    }, true);
  }

  setupOneClickClickListener();

  // ---------------------------------------------------------------------------
  // Dismiss / hide posting → hide OneClick button
  // ---------------------------------------------------------------------------

  const DISMISS_BUTTON_SELECTORS = [
    'button[aria-label*="dismiss" i]',
    'button[aria-label*="hide" i]',
    'button[aria-label*="不感兴趣"]',
    'button[aria-label*="忽略"]',
    'button[aria-label*="隐藏"]'
  ];
  const DISMISS_ACTION_RE = /\b(dismiss|hide)\b/i;
  const DISMISS_EXCLUDE_RE = /\bhidden gems?\b/i;
  const DISMISS_LABEL_CN_RE = /(不感兴趣|忽略|隐藏)/;
  const JOB_CARD_QUERY_SELECTOR = [
    'li[data-occludable-job-id]',
    'div[data-occludable-job-id]',
    'li.jobs-search-results__list-item',
    '.job-card-container',
    '.job-card-list__entity-lockup'
  ].join(', ');
  const DISMISSED_JOB_CARD_KEYS = new Set();
  const MAX_DISMISSED_JOB_CARD_KEYS = 200;
  let dismissRehideObserver = null;

  function isDismissButton(element) {
    if (!isInteractiveButtonLikeElement(element)) return false;

    for (const selector of DISMISS_BUTTON_SELECTORS) {
      try {
        if (element.matches(selector)) return true;
      } catch (_error) {
        // Ignore invalid selector.
      }
    }

    const controlName = String(element.getAttribute('data-control-name') || '').toLowerCase();
    if (controlName.includes('dismiss') || controlName.includes('hide')) return true;

    const label = getElementSearchableLabel(element);
    if (!label || label.length > 120) return false;
    if (DISMISS_EXCLUDE_RE.test(label)) return false;
    if (DISMISS_ACTION_RE.test(label)) return true;
    if (DISMISS_LABEL_CN_RE.test(label)) return true;

    return false;
  }

  function isLikelyJobCardContainer(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (element.hasAttribute('data-occludable-job-id') || element.hasAttribute('data-job-id')) return true;

    const classList = element.classList;
    if (!classList) return false;

    if (
      classList.contains('job-card-container') ||
      classList.contains('job-card-list__entity-lockup') ||
      classList.contains('jobs-search-results__list-item')
    ) {
      return true;
    }

    if (String(element.tagName || '').toUpperCase() === 'LI' && classList.contains('scaffold-layout__list-item')) {
      return Boolean(element.querySelector('[data-occludable-job-id], .job-card-container, .job-card-list__entity-lockup'));
    }

    return false;
  }

  function findJobCardContainer(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

    const closest = element.closest(JOB_CARD_QUERY_SELECTOR);
    if (isLikelyJobCardContainer(closest)) return closest;

    let candidate = element.parentElement;
    for (let i = 0; i < 12 && candidate && candidate !== document.body; i += 1) {
      if (isLikelyJobCardContainer(candidate)) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function getJobCardKey(container) {
    if (!container || container.nodeType !== Node.ELEMENT_NODE) return '';

    const dataJobId = String(
      container.getAttribute('data-occludable-job-id') ||
      container.getAttribute('data-job-id') ||
      container.dataset?.occludableJobId ||
      container.dataset?.jobId ||
      ''
    ).trim();
    if (dataJobId) return `job:${dataJobId}`;

    const jobLink = container.querySelector('a[href*="/jobs/view/"]');
    const jobHref = String(jobLink?.getAttribute('href') || jobLink?.href || '').trim();
    if (!jobHref) return '';

    const jobId = extractJobIdFromRawUrl(jobHref);
    if (jobId) return `job:${jobId}`;

    const stableUrl = jobHref.split('#')[0].split('?')[0];
    return stableUrl ? `url:${stableUrl}` : '';
  }

  function rememberDismissedJobCard(container) {
    const key = getJobCardKey(container);
    if (!key) return '';

    DISMISSED_JOB_CARD_KEYS.add(key);
    if (DISMISSED_JOB_CARD_KEYS.size > MAX_DISMISSED_JOB_CARD_KEYS) {
      const oldestKey = DISMISSED_JOB_CARD_KEYS.values().next().value;
      if (oldestKey) DISMISSED_JOB_CARD_KEYS.delete(oldestKey);
    }
    return key;
  }

  function shouldHideForDismissedJobCard(container) {
    const key = getJobCardKey(container);
    return Boolean(key && DISMISSED_JOB_CARD_KEYS.has(key));
  }

  function hideOneClickButtonsInContainer(container) {
    if (!container) return 0;
    let hiddenCount = 0;

    if (isOneClickButton(container) && !container.classList.contains('oneclick-hidden-by-dismiss')) {
      container.classList.add('oneclick-hidden-by-dismiss');
      hiddenCount += 1;
    }

    container.querySelectorAll('button, a, [role="button"]').forEach((el) => {
      if (isOneClickButton(el) && !el.classList.contains('oneclick-hidden-by-dismiss')) {
        el.classList.add('oneclick-hidden-by-dismiss');
        hiddenCount += 1;
      }
    });

    return hiddenCount;
  }

  function hideOneClickButtonsInNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    const cards = new Set();
    if (isLikelyJobCardContainer(node)) {
      cards.add(node);
    }
    node.querySelectorAll(JOB_CARD_QUERY_SELECTOR).forEach((card) => {
      if (isLikelyJobCardContainer(card)) cards.add(card);
    });

    cards.forEach((card) => {
      if (shouldHideForDismissedJobCard(card)) {
        hideOneClickButtonsInContainer(card);
      }
    });
  }

  function observeCardTemporarily(card, durationMs = 10000) {
    if (!card || card.nodeType !== Node.ELEMENT_NODE) return;
    const observer = new MutationObserver(() => {
      hideOneClickButtonsInContainer(card);
    });
    observer.observe(card, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), durationMs);
  }

  function ensureDismissRehideObserver() {
    if (dismissRehideObserver || !document.body) return;

    dismissRehideObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            hideOneClickButtonsInNode(node);
          }
        });
      });
    });

    dismissRehideObserver.observe(document.body, { childList: true, subtree: true });
  }

  function setupDismissClickListener() {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

      let dismissBtn = null;
      let candidate = target;
      for (let i = 0; i < 5 && candidate && candidate !== document.body; i += 1) {
        if (isDismissButton(candidate)) {
          dismissBtn = candidate;
          break;
        }
        candidate = candidate.parentElement;
      }

      if (!dismissBtn) return;

      const card = findJobCardContainer(dismissBtn);
      if (!card) return;

      hideOneClickButtonsInContainer(card);
      const dismissedKey = rememberDismissedJobCard(card);

      if (dismissedKey) {
        ensureDismissRehideObserver();
      } else {
        observeCardTemporarily(card);
      }
    }, true);
  }

  setupDismissClickListener();

  // ---------------------------------------------------------------------------
  // Message listeners
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return undefined;

    if (message.type === 'PING') {
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'GET_CURRENT_JOB_INFO') {
      (async () => {
        try {
          await expandJobDescriptionIfNeeded();
          sendResponse({ ok: true, jobInfo: await getCurrentJobInfo() });
        } catch (error) {
          sendResponse({ ok: false, message: error?.message || 'Failed to parse job info.' });
        }
      })();
      return true;
    }

    if (message.type === 'SHOW_EXPORT_TOAST') {
      showToast(String(message.message || ''), Boolean(message.isError));
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'DOWNLOAD_TXT_FILE') {
      const result = triggerTxtDownload(message.fileName, message.textContent);
      sendResponse(result);
      return undefined;
    }

    return undefined;
  });
})();
