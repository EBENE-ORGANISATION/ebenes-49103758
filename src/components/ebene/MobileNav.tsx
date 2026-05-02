import { useTranslation } from "react-i18next";

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: { value: string; label: string }[];
}

export const MobileNav = ({ activeTab, onTabChange, tabs }: Props) => {
  return (
    <div className="block sm:hidden w-full mb-4">
      <select
        value={activeTab}
        onChange={(e) => onTabChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background font-semibold"
      >
        {tabs.map((tab) => (
          <option key={tab.value} value={tab.value}>
            {tab.label}
          </option>
        ))}
      </select>
    </div>
  );
};