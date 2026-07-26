// The client directive is re-added to the bundled output by tsup (see tsup.config.ts).
export {
  useSmartRouter,
  type SmartRouter,
  type NextAppRouter,
} from "./react/use-smart-router";

// Re-export the native next/navigation hooks so consumers can grab the raw
// Next router (and friends) from the same import as the smart router.
export {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
} from "next/navigation";
