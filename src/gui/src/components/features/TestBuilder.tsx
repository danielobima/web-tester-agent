
import { Icons } from "../ui/Icons";

export const TestBuilder = () => {
  return (
    <section className="space-y-10 py-6">
      <h2 className="text-4xl font-bold font-display">Build New Test Suite</h2>

      {/* Prompt Section */}
      <div className="bg-surface-low rounded-md p-2 flex items-center gap-4 group">
        <div className="pl-4 text-primary">
          <Icons.Wand />
        </div>
        <input 
          type="text" 
          placeholder="Describe the user journey to test (e.g., 'Verify checkout flow with guest user')..."
          className="flex-1 bg-transparent py-4 text-lg outline-none placeholder:text-on-surface/30 font-medium"
        />
        <button className="bg-primary text-white flex items-center gap-2 px-8 py-4 rounded-md font-bold transition-all hover:px-10 active:scale-95 text-lg">
          Generate Script <Icons.ChevronRight />
        </button>
      </div>
    </section>
  );
};
