import type { BrightspaceItem } from '../types/wolfie';

export const fixtureBrightspaceMaterials: BrightspaceItem[] = [
  // New items that match weak spots
  {
    id: '1',
    course: 'CSE 373',
    title: 'Dynamic Programming Workshop Slides',
    kind: 'slides',
    topic: 'dynamic-programming',
    postedAt: '2026-10-24T08:00:00Z',
    dueAt: null,
    isNew: true,
    matchesWeakSpot: true
  },
  {
    id: '2',
    course: 'ESE 271',
    title: 'Phasor Analysis Problem Set',
    kind: 'problem-set',
    topic: 'phasors',
    postedAt: '2026-10-23T14:00:00Z',
    dueAt: '2026-10-30T23:59:00Z',
    isNew: true,
    matchesWeakSpot: true
  },
  // New items that don't match weak spots
  {
    id: '3',
    course: 'AMS 261',
    title: 'Double Integrals Lecture Recording',
    kind: 'video',
    topic: 'double-integrals',
    postedAt: '2026-10-24T10:00:00Z',
    dueAt: null,
    isNew: true,
    matchesWeakSpot: false
  },
  {
    id: '4',
    course: 'CSE 373',
    title: 'Graph Algorithms Reference',
    kind: 'pdf',
    topic: 'graph-algorithms',
    postedAt: '2026-10-23T09:00:00Z',
    dueAt: null,
    isNew: true,
    matchesWeakSpot: false
  },
  // Older items
  {
    id: '5',
    course: 'AMS 261',
    title: 'Vector Fields Problem Set 3',
    kind: 'problem-set',
    topic: 'vector-fields',
    postedAt: '2026-10-20T08:00:00Z',
    dueAt: '2026-10-27T23:59:00Z',
    isNew: false,
    matchesWeakSpot: true
  },
  {
    id: '6',
    course: 'ESE 271',
    title: 'Op-Amp Circuits Lab Guide',
    kind: 'pdf',
    topic: 'op-amp-circuits',
    postedAt: '2026-10-19T12:00:00Z',
    dueAt: null,
    isNew: false,
    matchesWeakSpot: false
  },
  {
    id: '7',
    course: 'CSE 373',
    title: 'Greedy Algorithms Slides',
    kind: 'slides',
    topic: 'greedy-algorithms',
    postedAt: '2026-10-18T10:00:00Z',
    dueAt: null,
    isNew: false,
    matchesWeakSpot: false
  },
  {
    id: '8',
    course: 'AMS 261',
    title: 'Line Integrals Practice Problems',
    kind: 'problem-set',
    topic: 'line-integrals',
    postedAt: '2026-10-17T14:00:00Z',
    dueAt: '2026-10-25T23:59:00Z',
    isNew: false,
    matchesWeakSpot: false
  },
  {
    id: '9',
    course: 'ESE 271',
    title: 'Node Analysis Tutorial Video',
    kind: 'video',
    topic: 'node-analysis',
    postedAt: '2026-10-16T11:00:00Z',
    dueAt: null,
    isNew: false,
    matchesWeakSpot: false
  },
  {
    id: '10',
    course: 'CSE 373',
    title: 'Sorting and Searching Review',
    kind: 'pdf',
    topic: 'sorting-and-searching',
    postedAt: '2026-10-15T09:00:00Z',
    dueAt: null,
    isNew: false,
    matchesWeakSpot: false
  }
];

export const kindIcons: Record<BrightspaceItem['kind'], string> = {
  'slides': '📊',
  'pdf': '📄',
  'problem-set': '📝',
  'video': '🎥'
};
