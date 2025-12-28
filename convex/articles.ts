import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new article
export const createArticle = mutation({
	args: {
		url: v.string(),
		title: v.string(),
		author: v.optional(v.string()),
		siteName: v.optional(v.string()),
		publishedDate: v.optional(v.string()),
		excerpt: v.optional(v.string()),
		content: v.string(),
		textContent: v.string(),
		readingTime: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Use a fixed user ID since middleware protects the route
		const userId = "authenticated-user";

		const articleId = await ctx.db.insert("articles", {
			userId,
			url: args.url,
			title: args.title,
			author: args.author,
			siteName: args.siteName,
			publishedDate: args.publishedDate,
			excerpt: args.excerpt,
			content: args.content,
			textContent: args.textContent,
			readingTime: args.readingTime,
			savedAt: Date.now(),
		});

		return articleId;
	},
});

// List all articles for the current user
export const listArticles = query({
	args: {
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		// Use a fixed user ID since middleware protects the route
		const userId = "authenticated-user";

		const limit = args.limit ?? 100;

		const articles = await ctx.db
			.query("articles")
			.withIndex("by_userId_savedAt", (q) => q.eq("userId", userId))
			.order("desc")
			.take(limit);

		return articles;
	},
});

// Get specific articles by IDs
export const getArticlesByIds = query({
	args: {
		ids: v.array(v.id("articles")),
	},
	handler: async (ctx, args) => {
		// Use a fixed user ID since middleware protects the route
		const userId = "authenticated-user";

		const articles = await Promise.all(
			args.ids.map(async (id) => {
				const article = await ctx.db.get(id);
				// Only return articles that belong to this user
				if (article && article.userId === userId) {
					return article;
				}
				return null;
			}),
		);

		// Filter out nulls and return
		return articles.filter((a) => a !== null);
	},
});

// Delete an article
export const deleteArticle = mutation({
	args: {
		id: v.id("articles"),
	},
	handler: async (ctx, args) => {
		// Use a fixed user ID since middleware protects the route
		const userId = "authenticated-user";

		const article = await ctx.db.get(args.id);
		if (!article) {
			throw new Error("Article not found");
		}

		if (article.userId !== userId) {
			throw new Error("Not authorized to delete this article");
		}

		await ctx.db.delete(args.id);
	},
});

// Get article count for stats
export const getStats = query({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return { total: 0 };
		}
		const userId = identity.subject;

		const articles = await ctx.db
			.query("articles")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect();

		return {
			total: articles.length,
		};
	},
});
