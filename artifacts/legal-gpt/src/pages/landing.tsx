import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, FileText, MessageSquare, Upload, Mail, Users, Database, ArrowRight, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-accent" />
            <span className="font-serif font-bold text-xl tracking-tight text-primary">LegalGPT</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-accent transition-colors">Login</Link>
            <Link href="/login" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">Get Started</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 lg:py-32 bg-primary text-primary-foreground text-center px-4 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-accent via-primary to-primary pointer-events-none"></div>
          <div className="container mx-auto max-w-4xl relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-accent mb-6 text-sm font-medium border border-accent/20">
              <Shield className="w-4 h-4" /> Enterprise-Grade AI Legal Assistant
            </div>
            <h1 className="text-5xl lg:text-7xl font-serif font-bold mb-6 leading-tight">
              LegalGPT: AI-Powered Legal Assistant
            </h1>
            <p className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto leading-relaxed">
              Analyze legal documents, extract clauses, draft contracts, ask legal questions, and generate formal letters using RAG and LLM support.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/login" className="bg-accent text-accent-foreground px-8 py-3 rounded-md font-medium text-lg hover:bg-accent/90 transition-colors flex items-center gap-2">
                Get Started <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/dashboard/upload" className="bg-white/10 text-white border border-white/20 px-8 py-3 rounded-md font-medium text-lg hover:bg-white/20 transition-colors">
                Upload Document
              </Link>
              <Link href="/dashboard/chat" className="bg-white/10 text-white border border-white/20 px-8 py-3 rounded-md font-medium text-lg hover:bg-white/20 transition-colors">
                Ask LegalGPT
              </Link>
            </div>
          </div>
        </section>

        {/* Disclaimer */}
        <div className="bg-accent/10 border-b border-accent/20 py-3 text-center px-4">
          <p className="text-sm font-medium text-accent-foreground">
            <span className="font-bold">Disclaimer:</span> This system provides AI-assisted legal information, not professional legal advice.
          </p>
        </div>

        {/* Features Section */}
        <section className="py-20 bg-muted/30 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-serif font-bold text-foreground mb-4">Comprehensive Legal Workflows</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Automate your legal documentation processes with state-of-the-art AI technology.</p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
              {[
                { icon: FileText, title: "Document Analysis", desc: "Instantly analyze complex contracts and agreements." },
                { icon: Shield, title: "Risk Detection", desc: "Identify potentially harmful clauses and loopholes." },
                { icon: MessageSquare, title: "Legal Chat", desc: "Ask context-aware questions about your documents." },
                { icon: Upload, title: "Secure Uploads", desc: "Enterprise-grade encryption for all your files." },
                { icon: Mail, title: "Formal Letters", desc: "Generate and send professional legal correspondence." },
                { icon: Users, title: "Advocate Directory", desc: "Find top-rated legal professionals by specialization." },
                { icon: Database, title: "Clause Extraction", desc: "Automatically pull key terms and dates." },
                { icon: CheckCircle2, title: "Contract Drafting", desc: "Generate custom NDAs and agreements in seconds." }
              ].map((feature, i) => (
                <div key={i} className="bg-card p-6 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-4">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* RAG Workflow Section */}
        <section className="py-20 px-4 bg-background">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-serif font-bold text-foreground mb-4">How It Works: The RAG Architecture</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Powered by Retrieval-Augmented Generation for pinpoint accuracy and context-aware responses.</p>
            </div>

            <div className="relative">
              {/* Desktop layout */}
              <div className="hidden lg:flex items-center justify-between relative z-10">
                <WorkflowStep icon={Upload} label="Upload Document" />
                <WorkflowArrow />
                <WorkflowStep icon={FileText} label="Text Extraction & Chunking" />
                <WorkflowArrow />
                <WorkflowStep icon={Database} label="ChromaDB Vector Store" />
                <WorkflowArrow />
                <WorkflowStep icon={MessageSquare} label="LLM Retrieval" />
                <WorkflowArrow />
                <WorkflowStep icon={CheckCircle2} label="Insights & Output" />
              </div>

              {/* Mobile layout */}
              <div className="lg:hidden flex flex-col items-center gap-6">
                <WorkflowStep icon={Upload} label="Upload Document" />
                <div className="w-px h-8 bg-border"></div>
                <WorkflowStep icon={FileText} label="Text Extraction & Chunking" />
                <div className="w-px h-8 bg-border"></div>
                <WorkflowStep icon={Database} label="ChromaDB Vector Store" />
                <div className="w-px h-8 bg-border"></div>
                <WorkflowStep icon={MessageSquare} label="LLM Retrieval" />
                <div className="w-px h-8 bg-border"></div>
                <WorkflowStep icon={CheckCircle2} label="Insights & Output" />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-primary text-primary-foreground text-center px-4">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-4xl font-serif font-bold mb-6">Ready to streamline your legal work?</h2>
            <p className="text-lg text-primary-foreground/80 mb-10">Join thousands of professionals using LegalGPT to save time and reduce risks.</p>
            <Link href="/login" className="bg-accent text-accent-foreground px-10 py-4 rounded-md font-bold text-lg hover:bg-accent/90 transition-colors inline-block shadow-lg">
              Create Your Free Account
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t py-12 px-4 text-center text-muted-foreground text-sm">
        <div className="container mx-auto">
          <div className="flex items-center justify-center gap-2 mb-4 text-foreground">
            <Shield className="w-5 h-5 text-accent" />
            <span className="font-serif font-bold text-lg">LegalGPT</span>
          </div>
          <p className="mb-4 max-w-md mx-auto">This system provides AI-assisted legal information, not professional legal advice. Always consult with a qualified attorney for specific legal issues.</p>
          <p>&copy; {new Date().getFullYear()} LegalGPT. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function WorkflowStep({ icon: Icon, label }: { icon: any, label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 w-40 text-center">
      <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg border-4 border-background z-10">
        <Icon className="w-8 h-8" />
      </div>
      <span className="font-semibold text-sm">{label}</span>
    </div>
  );
}

function WorkflowArrow() {
  return (
    <div className="flex-1 h-px bg-border relative -mx-4">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t-2 border-r-2 border-border rotate-45"></div>
    </div>
  );
}
