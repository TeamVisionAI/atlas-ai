import Skeleton from "../ui/Skeleton";

export default function ConfigurationLoading() {
  return (
    <div className="configuration-loading" role="status" aria-live="polite" aria-busy="true">
      <Skeleton variant="title" className="configuration-loading__title" />
      <Skeleton className="configuration-loading__line" />
      <Skeleton className="configuration-loading__line configuration-loading__line--short" />
      <Skeleton className="configuration-loading__field" />
      <Skeleton className="configuration-loading__field" />
    </div>
  );
}
