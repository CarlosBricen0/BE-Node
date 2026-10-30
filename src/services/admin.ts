

import { requireAdmin, HttpError } from "../lib/auth.js";
import { validText, validMedia, priceInPesos as parsePrice } from "../lib/policy.js";
import prisma from "../db/prisma.js";
import { formatMoney } from "../lib/money.js";


type PostArgs = {
	text: string;
	mediaUrl?: string;
	mediaType?: "image" | "video";
	isPublic: boolean;
};

export async function createPostAction({ isPublic, mediaUrl, mediaType, text }: PostArgs) {
	const admin = await checkIfAdmin();

	if (!admin) {
		throw new Error("Unauthorized");
	}

	if (mediaType && !['image','video'].includes(mediaType)) throw new HttpError(400,'Invalid media type');
	const newPost = await prisma.post.create({
		data: {
			text: validText(text),
			mediaUrl: validMedia(mediaUrl),
			mediaType,
			isPublic: isPublic === true,
			userId: admin.id,
		},
	});

	return { success: true, post: newPost };
}

export async function getAllProductsAction() {
	const isAdmin = await checkIfAdmin();

	if (!isAdmin) {
		throw new Error("Unauthorized");
	}

	const products = await prisma.product.findMany();

	return products;
}

type ProductArgs = {
	name: string;
	image: string;
	price: string;
};

export async function addNewProductToStoreAction({ name, image, price }: ProductArgs) {
	const isAdmin = await checkIfAdmin();

	if (!isAdmin) {
		throw new Error("Unauthorized");
	}

	if (!name || !image || !price) {
		throw new Error("Please provide all the required fields");
	}

	const priceInPesos = parsePrice(price);

	if (isNaN(priceInPesos)) {
		throw new Error("Price must be a number");
	}

	const newProduct = await prisma.product.create({
		data: {
			image: validMedia(image)!,
			price: priceInPesos,
 currency: "CLP",
			name: validText(name, 150),
		},
	});

	return { success: true, product: newProduct };
}

export async function toggleProductArchiveAction(productId: string) {
	const isAdmin = await checkIfAdmin();
	if (!isAdmin) {
		throw new Error("Unauthorized");
	}

	const product = await prisma.product.findUnique({ where: { id: productId } });

	if (!product) {
		throw new Error("Product not found");
	}

	const updatedProduct = await prisma.product.update({
		where: { id: productId },
		data: {
			isArchived: !product.isArchived,
		},
	});

	return { success: true, product: updatedProduct };
}

export async function getDashboardData() {
 await requireAdmin();
	const totalRevenuePromise = prisma.payment.aggregate({ where: { currency: "CLP", status: { in: ["approved", "refunded", "charged_back"] } }, _sum: { amount: true, refundedAmount: true } });

	const totalSalesPromise = prisma.order.count({ where: { isPaid: true } });
	const totalSubscriptionsPromise = prisma.subscription.count({ where: { status: { in: ["active", "trialing", "authorized", "paused", "cancelled"] }, endDate: { gt: new Date() } } });

	const recentSalesPromise = prisma.order.findMany({
 where: { isPaid: true },
		take: 4,
		orderBy: {
			orderDate: "desc",
		},
		select: {
			user: {
				select: {
					name: true,
					email: true,
					image: true,
				},
			},
			price: true,
 currency: true,
			orderDate: true,
		},
	});

	const recentSubscriptionsPromise = prisma.subscription.findMany({
		take: 4,
		orderBy: {
			startDate: "desc",
		},
		select: {
			user: {
				select: {
					name: true,
					email: true,
					image: true,
				},
			},
			price: true,
 currency: true,
			startDate: true,
		},
	});

	// run all promises in parallel so that they don't block each other
	const [totalRevenueResult, totalSales, totalSubscriptions, recentSales, recentSubscriptions] = await Promise.all([
		totalRevenuePromise,
		totalSalesPromise,
		totalSubscriptionsPromise,
		recentSalesPromise,
		recentSubscriptionsPromise,
	]);

	const totalRevenue = (totalRevenueResult._sum.amount || 0) - (totalRevenueResult._sum.refundedAmount || 0);

	return {
		totalRevenue: formatMoney(totalRevenue, "CLP"),
		totalSales,
		totalSubscriptions,
		recentSales,
		recentSubscriptions,
	};
}

async function checkIfAdmin() { return requireAdmin(); }
