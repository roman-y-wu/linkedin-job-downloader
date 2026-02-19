import { BaseExtractor } from './_base';
import { ExtractorResult } from '../types/extractors';
export declare class RedditExtractor extends BaseExtractor {
    private shredditPost;
    constructor(document: Document, url: string);
    canExtract(): boolean;
    extract(): ExtractorResult;
    private getPostContent;
    private createContentHtml;
    private extractComments;
    private getPostId;
    private getSubreddit;
    private getPostAuthor;
    private createDescription;
    private processComments;
}
