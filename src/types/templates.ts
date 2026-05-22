import { IPopulatedRevisionCard } from "@/hooks/useRevisionCards";

export type TemplateType = 
  | 'intro' 
  | 'intuition' 
  | 'observation' 
  | 'dryrun' 
  | 'code' 
  | 'complexity' 
  | 'mistake' 
  | 'visual' 
  | 'summary';

export interface ITemplateProps {
  headline: string;
  body?: string;
  code?: string;
  blocks?: any[];
  card: IPopulatedRevisionCard;
}