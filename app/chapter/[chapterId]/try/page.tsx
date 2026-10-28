import { notFound } from "next/navigation";
import { chapterById } from "@/src/domain/curriculum";
import { ChapterLesson } from "@/src/ui/player/ChapterLesson";

export function generateStaticParams() {
  return [...chapterById.keys()].map((chapterId) => ({ chapterId }));
}

export default async function TryPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  if (!chapterById.has(chapterId)) notFound();
  return <ChapterLesson chapterId={chapterId} />;
}
