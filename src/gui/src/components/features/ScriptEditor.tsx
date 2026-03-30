
import { Icons } from "../ui/Icons";

export const ScriptEditor = () => {
  return (
    <div className="h-full bg-surface-lowest rounded-md shadow-ambient overflow-hidden flex flex-col border border-on-surface/5">
      <div className="h-14 bg-surface-low flex items-center justify-between px-6 border-b border-on-surface/5 shrink-0">
        <div className="flex items-center gap-3">
          <Icons.Dashboard />
          <span className="text-sm font-bold">Generated Script: <span className="text-on-surface/50 font-medium">checkout_workflow.spec.ts</span></span>
        </div>
        <div className="flex gap-4 text-on-surface/40 scale-90">
          <Icons.Regression />
          <Icons.Bug />
        </div>
      </div>
      <div className="flex-1 p-8 font-mono text-sm overflow-y-auto bg-surface-lowest">
        <pre className="text-on-surface/80 leading-relaxed">
          <span className="text-orange-600">import</span> {"{ "}test, expect{" } "} <span className="text-orange-600">from</span> <span className="text-blue-600">'@playwright/test'</span>;
          <br/><br/>
          <span className="text-blue-600">test</span>(<span className="text-blue-600">'guest user can complete checkout'</span>, <span className="text-orange-600">async</span> ({"{ "}page{" }"}) ={"> "} {"{"}
          <br/>
          <span className="text-on-surface/30">  // Navigate to product page</span>
          <br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">goto</span>(<span className="text-blue-600">'/products/clinical-arch-v1'</span>);
          <br/><br/>
          <span className="text-on-surface/30">  // Add to cart</span>
          <br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">getByRole</span>(<span className="text-blue-600">'button'</span>, {"{ "} name: <span className="text-blue-600">'Add to Cart'</span> {"}"}).<span className="text-blue-600">click</span>();
          <br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">getByRole</span>(<span className="text-blue-600">'link'</span>, {"{ "} name: <span className="text-blue-600">'Checkout'</span> {"}"}).<span className="text-blue-600">click</span>();
          <br/><br/>
          <span className="text-on-surface/30">  // Guest Checkout Information</span>
          <br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">fill</span>(<span className="text-blue-600">'input[name="email"]'</span>, <span className="text-blue-600">'qa-bot@testops.io'</span>);
          <br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">fill</span>(<span className="text-blue-600">'input[name="address"]'</span>, <span className="text-blue-600">'123 Monolith Way'</span>);
          <br/><br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">selectOption</span>(<span className="text-blue-600">'select[name="shipping"]'</span>, <span className="text-blue-600">'Express'</span>);
          <br/>
          <span className="text-orange-600">  await</span> page.<span className="text-blue-600">click</span>(<span className="text-blue-600">'button:has-text("Continue to Payment")'</span>);
          <br/><br/>
          <span className="text-on-surface/30">  // Assert Success State</span>
          <br/>
          <span className="text-orange-600">  await</span> <span className="text-blue-600">expect</span>(page.<span className="text-blue-600">locator</span>(<span className="text-blue-600">'h1'</span>)).<span className="text-blue-600">toContainText</span>(<span className="text-blue-600">'Order Confirmed'</span>);
          <br/>
          {"});"}
        </pre>
      </div>
      <div className="h-12 bg-surface-low border-t border-on-surface/5 flex items-center justify-between px-6 shrink-0">
        <div className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">TypeScript 5.1 | Playwright 1.38</div>
        <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest">
          <span className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"><Icons.Dashboard /> Compare Versions</span>
          <span className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"><Icons.TestSuites /> Commit Suite</span>
        </div>
      </div>
    </div>
  );
};
