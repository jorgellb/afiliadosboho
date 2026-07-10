import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { getArticleById, getInternalLinks } from "@/lib/articles";
import { ArticleEditor } from "./article-editor";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditArticlePage({ params }: Props) {
  const { id } = await params;
  const article = await getArticleById(id);
  if (!article) notFound();

  // El selector de piezas y el de enlaces se resuelven en el servidor: el
  // catálogo es pequeño y así el editor no necesita más peticiones.
  const [catalog, links] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        imageUrl: products.imageUrl,
        category: products.category,
      })
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.available, true)))
      .limit(300),
    getInternalLinks(id),
  ]);

  return (
    <>
      <p className="art-back">
        <Link href="/admin/articles">← La revista</Link>
      </p>
      <ArticleEditor
        article={{
          id: article.id,
          slug: article.slug,
          title: article.title,
          metaTitle: article.metaTitle,
          metaDescription: article.metaDescription,
          excerpt: article.excerpt,
          body: article.body,
          category: article.category,
          heroImageUrl: article.heroImageUrl,
          heroImageAlt: article.heroImageAlt,
          productIds: article.productIds,
          published: article.published,
        }}
        catalog={catalog}
        internalLinks={links}
      />
    </>
  );
}
