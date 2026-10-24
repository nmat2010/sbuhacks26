// Deterministic ideas and reading list for DEMO_MODE and tests. The reading list mixes real,
// well-known papers (which the demo catalog verifies) with one invented title, so the demo shows
// verification dropping a paper that cannot be found.

export function mockIdeas(key: Record<string, unknown> | undefined): unknown {
  const goal = String(key?.goalTitle ?? 'your goal');
  const project = key?.goalType === 'project';
  return {
    ideas: [
      {
        title: project ? 'A small, working first version' : 'Reproduce a well-known result',
        scope: `A two to three week piece of work related to "${goal}" that ends with something you can show in a short demo.`,
        skills: ['Python', 'reading papers', 'git'],
        first_week_task: 'Pick one paper from the reading list, read the abstract and introduction, and write three questions about it.'
      },
      {
        title: 'Small extension of an existing method',
        scope: 'Change one thing about a published approach (data, model size, or a metric) and measure what happens.',
        skills: ['Python', 'experiment design', 'plotting'],
        first_week_task: 'Run the authors\' released code, or a simple baseline, on a tiny dataset and record the result.'
      },
      {
        title: 'Literature map',
        scope: 'A two-page map of how five related papers connect, which a professor could use to see what you know.',
        skills: ['reading papers', 'writing'],
        first_week_task: 'List ten candidate papers and mark which three you would read first and why.'
      },
      {
        title: 'Open-source contribution',
        scope: 'A small, merged improvement to a project close to your goal, such as a doc fix, a test, or a minor feature.',
        skills: ['git', 'reading code', 'communication'],
        first_week_task: 'Find a project you like and read its contributing guide and three open issues labeled "good first issue".'
      }
    ],
    reading_list: [
      { title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'], year: 2017, why: 'The paper behind modern language models, and a good first look at how a research paper is organized.' },
      { title: 'Deep Residual Learning for Image Recognition', authors: ['Kaiming He', 'Xiangyu Zhang'], year: 2015, why: 'A clear idea (skip connections) with a clear experiment, good for practicing how to read results.' },
      { title: 'Adam: A Method for Stochastic Optimization', authors: ['Diederik P. Kingma', 'Jimmy Ba'], year: 2014, why: 'The optimizer you will see in almost every project; short and approachable.' },
      { title: 'Quantum Banana Networks for Self-Healing Homework', authors: ['A. Nonexistent'], year: 2021, why: 'An invented title: this one should be dropped by the verification step.' },
      { title: 'Generative Adversarial Networks', authors: ['Ian J. Goodfellow', 'Jean Pouget-Abadie'], year: 2014, why: 'A different way of thinking about learning, with a short and readable method section.' },
      { title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', authors: ['Jacob Devlin'], year: 2018, why: 'Shows how a simple pre-training idea changed a whole field.' },
      { title: 'Language Models are Few-Shot Learners', authors: ['Tom B. Brown'], year: 2020, why: 'A good example of a paper whose evaluation section is as important as its method.' }
    ]
  };
}
