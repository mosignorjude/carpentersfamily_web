"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ConstitutionModal } from "./constitution-modal";
import { MembershipIntakeModal } from "./membership-intake-modal";
import { PartnershipEnquiryModal } from "./partnership-enquiry-modal";

interface LandingModalsProps {
  initialModal?: string;
}

export function LandingModals({ initialModal }: LandingModalsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeModal = searchParams?.get("modal") ?? initialModal ?? null;

  const handleClose = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("modal");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <MembershipIntakeModal
        isOpen={activeModal === "membership"}
        onClose={handleClose}
      />
      <PartnershipEnquiryModal
        isOpen={activeModal === "partnership"}
        onClose={handleClose}
      />
      <ConstitutionModal
        isOpen={activeModal === "constitution"}
        onClose={handleClose}
      />
    </>
  );
}
