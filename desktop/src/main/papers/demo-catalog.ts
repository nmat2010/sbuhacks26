import { normalizeTitle, type PaperRecord, type PaperSearcher } from './types.js';

// DEMO_MODE has no network, so "arXiv" is this small catalog of real, well-known papers. It lets
// the demo show both outcomes: papers that verify, and one invented title that is dropped.

const entry = (title: string, authors: string[], year: number, arxivId: string): PaperRecord => ({
  title,
  authors,
  year,
  arxivId,
  url: `https://arxiv.org/abs/${arxivId}`,
  source: 'demo_catalog'
});

export const DEMO_CATALOG: PaperRecord[] = [
  entry('Attention Is All You Need', ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez', 'Lukasz Kaiser', 'Illia Polosukhin'], 2017, '1706.03762'),
  entry('BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'], 2018, '1810.04805'),
  entry('Deep Residual Learning for Image Recognition', ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'], 2015, '1512.03385'),
  entry('Adam: A Method for Stochastic Optimization', ['Diederik P. Kingma', 'Jimmy Ba'], 2014, '1412.6980'),
  entry('Language Models are Few-Shot Learners', ['Tom B. Brown', 'Benjamin Mann', 'Nick Ryder'], 2020, '2005.14165'),
  entry('Playing Atari with Deep Reinforcement Learning', ['Volodymyr Mnih', 'Koray Kavukcuoglu', 'David Silver'], 2013, '1312.5602'),
  entry('Generative Adversarial Networks', ['Ian J. Goodfellow', 'Jean Pouget-Abadie', 'Mehdi Mirza'], 2014, '1406.2661'),
  entry('Neural Machine Translation by Jointly Learning to Align and Translate', ['Dzmitry Bahdanau', 'Kyunghyun Cho', 'Yoshua Bengio'], 2014, '1409.0473')
];

export class DemoCatalogSearcher implements PaperSearcher {
  readonly name = 'demo_catalog' as const;
  async searchByTitle(title: string): Promise<PaperRecord[]> {
    const words = normalizeTitle(title).split(' ').filter(Boolean);
    if (words.length === 0) return [];
    return DEMO_CATALOG.filter((p) => {
      const t = normalizeTitle(p.title);
      return words.every((w) => t.includes(w));
    });
  }
}
