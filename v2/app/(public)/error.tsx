'use client';
import {PublicErrorState} from '@/components/public/error-state';
export default function ErrorPage({reset}: {error: Error & {digest?: string}; reset: () => void}) {
  return <PublicErrorState retry={reset}/>;
}
