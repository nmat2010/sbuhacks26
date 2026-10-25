import type { TopicScore } from '../types/wolfie';

export const fixtureTopicScores: TopicScore[] = [
  // Weak topics
  {
    topic: 'dynamic-programming',
    score10: 3,
    band: 'weak',
    unaidedSolved: 4,
    attempted: 14,
    changeVsTwoWeeks: -1,
    usualStall: 'Defining the subproblem'
  },
  {
    topic: 'phasors',
    score10: 3,
    band: 'weak',
    unaidedSolved: 3,
    attempted: 8,
    changeVsTwoWeeks: 0,
    usualStall: 'Converting to phasor domain'
  },
  {
    topic: 'vector-fields',
    score10: 4,
    band: 'weak',
    unaidedSolved: 5,
    attempted: 12,
    changeVsTwoWeeks: -1,
    usualStall: 'Setting up the integral'
  },
  // Getting there
  {
    topic: 'greedy-algorithms',
    score10: 5,
    band: 'getting-there',
    unaidedSolved: 6,
    attempted: 11,
    changeVsTwoWeeks: 0
  },
  {
    topic: 'op-amp-circuits',
    score10: 5,
    band: 'getting-there',
    unaidedSolved: 6,
    attempted: 11,
    changeVsTwoWeeks: 1
  },
  {
    topic: 'line-integrals',
    score10: 6,
    band: 'getting-there',
    unaidedSolved: 8,
    attempted: 13,
    changeVsTwoWeeks: 1
  },
  // Strong topics
  {
    topic: 'recursion',
    score10: 7,
    band: 'strong',
    unaidedSolved: 8,
    attempted: 11,
    changeVsTwoWeeks: 1
  },
  {
    topic: 'node-analysis',
    score10: 7,
    band: 'strong',
    unaidedSolved: 7,
    attempted: 10,
    changeVsTwoWeeks: 0
  },
  {
    topic: 'sorting-and-searching',
    score10: 8,
    band: 'strong',
    unaidedSolved: 11,
    attempted: 13,
    changeVsTwoWeeks: 0
  },
  {
    topic: 'double-integrals',
    score10: 8,
    band: 'strong',
    unaidedSolved: 9,
    attempted: 11,
    changeVsTwoWeeks: 1
  },
  {
    topic: 'graph-algorithms',
    score10: 9,
    band: 'strong',
    unaidedSolved: 14,
    attempted: 15,
    changeVsTwoWeeks: 1
  }
];

export const topicToCourse: Record<string, string> = {
  'dynamic-programming': 'CSE 373',
  'greedy-algorithms': 'CSE 373',
  'recursion': 'CSE 373',
  'sorting-and-searching': 'CSE 373',
  'graph-algorithms': 'CSE 373',
  'line-integrals': 'AMS 261',
  'vector-fields': 'AMS 261',
  'double-integrals': 'AMS 261',
  'phasors': 'ESE 271',
  'op-amp-circuits': 'ESE 271',
  'node-analysis': 'ESE 271'
};

export const topicDisplayNames: Record<string, string> = {
  'dynamic-programming': 'Dynamic programming',
  'greedy-algorithms': 'Greedy algorithms',
  'recursion': 'Recursion',
  'sorting-and-searching': 'Sorting and searching',
  'graph-algorithms': 'Graph algorithms',
  'line-integrals': 'Line integrals',
  'vector-fields': 'Vector fields',
  'double-integrals': 'Double integrals',
  'phasors': 'Phasors',
  'op-amp-circuits': 'Op-amp circuits',
  'node-analysis': 'Node analysis'
};

export const practicePlan = [
  { title: 'Climbing stairs', estimatedMin: 10 },
  { title: 'Coin change', estimatedMin: 15 },
  { title: 'Longest increasing subsequence', estimatedMin: 15 }
];
