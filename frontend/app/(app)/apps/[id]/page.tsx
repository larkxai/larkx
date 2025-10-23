"use client";

import React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Sparkles, Clock3, Eye, Hash, Image, History, Rocket, Clock, GitBranch, Settings, Zap } from "lucide-react";
import androidIcon from "../../../android.png";
import iosIcon from "../../../ios.png";

type StoreStatus = "live" | "in_review" | "rejected" | "draft" | "preview" | "approved";

interface PlatformMeta {
  title: string;
  status: StoreStatus;
}

interface AppDetailsMock {
  id: string;
  name: string;
  ios: PlatformMeta;
  android: PlatformMeta;
}

// minimal inline store to make the page work during UX iteration
const DATA: AppDetailsMock[] = [
  { id: "app_travelly", name: "Travelly", ios: { title: "Travelly", status: "preview" }, android: { title: "Travelly", status: "in_review" } },
  { id: "app_shoply", name: "Shoply", ios: { title: "Shoply", status: "in_review" }, android: { title: "Shoply – Deals", status: "rejected" } },
];

export default function AppDetailsPage() {
  const params = useParams();
  const appId = params?.id as string;
  const app = React.useMemo(() => DATA.find(a => a.id === appId) || DATA[0], [appId]);

  const [titleIos, setTitleIos] = React.useState(app.ios.title);
  const [titleAndroid, setTitleAndroid] = React.useState(app.android.title);
  const [subtitleIos, setSubtitleIos] = React.useState("");
  const [subtitleAndroid, setSubtitleAndroid] = React.useState("");
  const [shortDescIos, setShortDescIos] = React.useState("Discover amazing places and plan your perfect trip");
  const [shortDescAndroid, setShortDescAndroid] = React.useState("Discover amazing places and plan your perfect trip");
  const [longDescIos, setLongDescIos] = React.useState("Travelly is your ultimate travel companion. Find the best destinations, book flights and hotels, and create unforgettable memories. With our AI-powered recommendations, you'll discover hidden gems and plan the perfect itinerary for any adventure.");
  const [longDescAndroid, setLongDescAndroid] = React.useState("Travelly is your ultimate travel companion. Find the best destinations, book flights and hotels, and create unforgettable memories. With our AI-powered recommendations, you'll discover hidden gems and plan the perfect itinerary for any adventure.");
  const [keywordsIos, setKeywordsIos] = React.useState("travel,booking,hotels,flights,vacation");
  const [keywordsAndroid, setKeywordsAndroid] = React.useState("travel,booking,hotels,flights,vacation");
  const [categoryIos, setCategoryIos] = React.useState("Travel");
  const [categoryAndroid, setCategoryAndroid] = React.useState("Travel");
  const [ageRatingIos, setAgeRatingIos] = React.useState("4+");
  const [ageRatingAndroid, setAgeRatingAndroid] = React.useState("Everyone");
  // Platform-specific fields
  const [promotionalTextIos, setPromotionalTextIos] = React.useState("Discover amazing places and plan your perfect trip with AI-powered recommendations");
  const [dataSafetyAndroid, setDataSafetyAndroid] = React.useState("This app collects location data to provide personalized travel recommendations");
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = React.useState("https://travelly.com/privacy");
  const [supportUrl, setSupportUrl] = React.useState("https://travelly.com/support");
  const [tab, setTab] = React.useState<"content" | "credentials" | "compliance" | "releases" | "history" | "integrations">("content");
  const [currentVersion] = React.useState("v1.2");
  const [showHistory, setShowHistory] = React.useState(false);

  const Mismatch = ({ show }: { show: boolean }) =>
    show ? (
      <span className="ml-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">mismatch</span>
    ) : null;

  const FieldRow = ({
    label,
    ios,
    android,
    onIos,
    onAndroid,
    placeholderIos,
    placeholderAndroid,
    iosLimit,
    androidLimit,
    showAI = true,
  }: {
    label: string;
    ios: string;
    android: string;
    onIos: (v: string) => void;
    onAndroid: (v: string) => void;
    placeholderIos?: string;
    placeholderAndroid?: string;
    iosLimit?: number;
    androidLimit?: number;
    showAI?: boolean;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center text-sm text-slate-300">
        <span>{label}</span>
        <Mismatch show={ios.trim() !== android.trim()} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-2">
              <img src={iosIcon.src} alt="iOS" className="h-3.5 w-3.5 object-contain" />
              iOS {iosLimit && `(${ios.length}/${iosLimit})`}
            </span>
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
              onClick={() => onIos(android)}
            >
              copy Android
            </button>
          </div>
          <div className="relative">
            <Input 
              value={ios} 
              onChange={(e)=>onIos(e.target.value)} 
              placeholder={placeholderIos} 
              className={`bg-slate-900/60 border-white/10 pr-10 ${iosLimit && ios.length > iosLimit ? 'border-red-400/50' : ''}`}
              maxLength={iosLimit}
            />
            {showAI && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-indigo-400/20 text-indigo-300 hover:text-indigo-200 transition-colors"
                title="AI Generate"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
            <span className="inline-flex items-center gap-2">
              <img src={androidIcon.src} alt="Android" className="h-3.5 w-3.5 object-contain" />
              Android {androidLimit && `(${android.length}/${androidLimit})`}
            </span>
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
              onClick={() => onAndroid(ios)}
            >
              copy iOS
            </button>
          </div>
          <div className="relative">
            <Input 
              value={android} 
              onChange={(e)=>onAndroid(e.target.value)} 
              placeholder={placeholderAndroid} 
              className={`bg-slate-900/60 border-white/10 pr-10 ${androidLimit && android.length > androidLimit ? 'border-red-400/50' : ''}`}
              maxLength={androidLimit}
            />
            {showAI && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-indigo-400/20 text-indigo-300 hover:text-indigo-200 transition-colors"
                title="AI Generate"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const SingleFieldRow = ({
    label,
    value,
    onChange,
    placeholder,
    limit,
    platform,
    showAI = true,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    limit?: number;
    platform: "ios" | "android";
    showAI?: boolean;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center text-sm text-slate-300">
        <span>{label}</span>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span className="inline-flex items-center gap-2">
            <img 
              src={platform === "ios" ? iosIcon.src : androidIcon.src} 
              alt={platform === "ios" ? "iOS" : "Android"} 
              className="h-3.5 w-3.5 object-contain" 
            />
            {platform === "ios" ? "iOS" : "Android"} {limit && `(${value.length}/${limit})`}
          </span>
        </div>
        <div className="relative">
          <Input 
            value={value} 
            onChange={(e)=>onChange(e.target.value)} 
            placeholder={placeholder} 
            className={`bg-slate-900/60 border-white/10 pr-10 ${limit && value.length > limit ? 'border-red-400/50' : ''}`}
            maxLength={limit}
          />
          {showAI && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-indigo-400/20 text-indigo-300 hover:text-indigo-200 transition-colors"
              title="AI Generate"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen text-slate-100">
      <div className="w-full">
        <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{app.name}</h1>
            <p className="text-slate-400">Manage store metadata and releases</p>
          </div>
          <div className="flex gap-2">
            <Link href="/apps" className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">Back to apps</Link>
            <Button className="rounded-md bg-indigo-500 hover:bg-indigo-600">Save</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-1 inline-flex gap-1">
          {[
            { key: "content", label: "App Content" },
            { key: "credentials", label: "Credentials" },
            { key: "compliance", label: "Compliance" },
            { key: "releases", label: "Releases" },
            { key: "integrations", label: "CI/CD" },
            { key: "history", label: "History" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as "content" | "credentials" | "compliance" | "releases" | "integrations" | "history")}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                tab === (t.key as "content" | "credentials" | "compliance" | "releases" | "integrations" | "history")
                  ? "bg-slate-900/70 text-slate-100 border border-white/10"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              {t.label}
              {t.key === "content" && (
                <span className="inline-flex items-center rounded-md border border-indigo-400/30 bg-indigo-400/10 px-1.5 py-0.5 text-xs font-medium text-indigo-300">
                  {currentVersion}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "content" && (
          <div className="space-y-6">
            {/* Basic Information */}
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 transition-colors"
                  >
                    <Clock3 className="h-4 w-4" />
                    History
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <FieldRow
                  label="App Title"
                  ios={titleIos}
                  android={titleAndroid}
                  onIos={setTitleIos}
                  onAndroid={setTitleAndroid}
                  placeholderIos="App title for iOS"
                  placeholderAndroid="App title for Android"
                  iosLimit={30}
                  androidLimit={30}
                />

                <FieldRow
                  label="Subtitle"
                  ios={subtitleIos}
                  android={subtitleAndroid}
                  onIos={setSubtitleIos}
                  onAndroid={setSubtitleAndroid}
                  placeholderIos="Optional subtitle for iOS"
                  placeholderAndroid="Short description for Android"
                  iosLimit={30}
                  androidLimit={80}
                />

                <FieldRow
                  label="Short Description"
                  ios={shortDescIos}
                  android={shortDescAndroid}
                  onIos={setShortDescIos}
                  onAndroid={setShortDescAndroid}
                  placeholderIos="Promotional text (170 chars)"
                  placeholderAndroid="Brief description (80 chars)"
                  iosLimit={170}
                  androidLimit={80}
                />
              </CardContent>
            </Card>

            {/* Detailed Information */}
        <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
          <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Detailed Information
                </CardTitle>
          </CardHeader>
              <CardContent className="space-y-6">
            <div className="space-y-2">
                  <div className="flex items-center text-sm text-slate-300">
                    <span>Long Description</span>
                    <Mismatch show={longDescIos.trim() !== longDescAndroid.trim()} />
                  </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                        <span className="inline-flex items-center gap-2">
                          <img src={iosIcon.src} alt="iOS" className="h-3.5 w-3.5 object-contain" />
                          iOS (max 4000 chars)
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
                          onClick={() => setLongDescIos(longDescAndroid)}
                        >
                          copy Android
                        </button>
                      </div>
                      <textarea 
                        value={longDescIos} 
                        onChange={(e)=>setLongDescIos(e.target.value)} 
                        placeholder="Detailed description for iOS App Store"
                        className="w-full h-24 bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 resize-none"
                      />
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                        <span className="inline-flex items-center gap-2">
                          <img src={androidIcon.src} alt="Android" className="h-3.5 w-3.5 object-contain" />
                          Android (max 4000 chars)
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
                          onClick={() => setLongDescAndroid(longDescIos)}
                        >
                          copy iOS
                        </button>
                      </div>
                      <textarea 
                        value={longDescAndroid} 
                        onChange={(e)=>setLongDescAndroid(e.target.value)} 
                        placeholder="Detailed description for Google Play"
                        className="w-full h-24 bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 resize-none"
                      />
                    </div>
                  </div>
                </div>

                <FieldRow
                  label="Keywords"
                  ios={keywordsIos}
                  android={keywordsAndroid}
                  onIos={setKeywordsIos}
                  onAndroid={setKeywordsAndroid}
                  placeholderIos="Keywords separated by commas"
                  placeholderAndroid="Keywords separated by commas"
                  iosLimit={100}
                  showAI={false}
                />

                {/* iOS-only field */}
                <SingleFieldRow
                  label="Promotional Text"
                  value={promotionalTextIos}
                  onChange={setPromotionalTextIos}
                  placeholder="Promotional text for App Store (170 chars)"
                  limit={170}
                  platform="ios"
                />

                {/* Android-only field */}
                <SingleFieldRow
                  label="Data Safety Description"
                  value={dataSafetyAndroid}
                  onChange={setDataSafetyAndroid}
                  placeholder="Describe how your app handles user data"
                  limit={4000}
                  platform="android"
                />
              </CardContent>
            </Card>

            {/* App Store Settings */}
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  Store Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <FieldRow
                  label="Category"
                  ios={categoryIos}
                  android={categoryAndroid}
                  onIos={setCategoryIos}
                  onAndroid={setCategoryAndroid}
                  placeholderIos="Select category"
                  placeholderAndroid="Select category"
                  showAI={false}
                />

                <FieldRow
                  label="Age Rating"
                  ios={ageRatingIos}
                  android={ageRatingAndroid}
                  onIos={setAgeRatingIos}
                  onAndroid={setAgeRatingAndroid}
                  placeholderIos="Age rating"
                  placeholderAndroid="Content rating"
                  showAI={false}
                />

                {/* Shared fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SingleFieldRow
                    label="Privacy Policy URL"
                    value={privacyPolicyUrl}
                    onChange={setPrivacyPolicyUrl}
                    placeholder="https://your-app.com/privacy"
                    platform="ios"
                    showAI={false}
                  />
                  <SingleFieldRow
                    label="Support URL"
                    value={supportUrl}
                    onChange={setSupportUrl}
                    placeholder="https://your-app.com/support"
                    platform="android"
                    showAI={false}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Screenshots & Media */}
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Screenshots & Media
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 mb-3 text-sm text-slate-300">
                      <img src={iosIcon.src} alt="iOS" className="h-4 w-4 object-contain" />
                      iOS Screenshots
                    </div>
                    <div className="space-y-2 text-xs text-slate-400">
                      <div>• iPhone 6.7&quot; (3 required)</div>
                      <div>• iPhone 6.5&quot; (3 required)</div>
                      <div>• iPad Pro 12.9&quot; (3 required)</div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm">
                        Upload Screenshots
                      </Button>
                      <Button variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-sm">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 mb-3 text-sm text-slate-300">
                      <img src={androidIcon.src} alt="Android" className="h-4 w-4 object-contain" />
                      Android Screenshots
                    </div>
                    <div className="space-y-2 text-xs text-slate-400">
                      <div>• Phone (2 required)</div>
                      <div>• 7-inch tablet (1 required)</div>
                      <div>• 10-inch tablet (1 required)</div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm">
                        Upload Screenshots
                      </Button>
                      <Button variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-sm">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-slate-500">Unified fields with platform-specific inputs reduce context-switching while keeping platform separation clear. Use &quot;copy&quot; buttons to quickly sync values between platforms.</p>
          </div>
        )}

        {/* Content History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900/95 backdrop-blur border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Content History
                </h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">v1.2 - Current</div>
                        <div className="text-xs text-slate-400">Updated app title and description</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">2 hours ago</div>
                      <button className="text-xs text-indigo-400 hover:text-indigo-300">Restore</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">v1.1</div>
                        <div className="text-xs text-slate-400">Initial content setup</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">1 day ago</div>
                      <button className="text-xs text-indigo-400 hover:text-indigo-300">Restore</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">v1.0</div>
                        <div className="text-xs text-slate-400">First version</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">3 days ago</div>
                      <button className="text-xs text-indigo-400 hover:text-indigo-300">Restore</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
                <button
                  onClick={() => setShowHistory(false)}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-slate-100 transition-colors"
                >
                  Close
                </button>
                <button className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded-md transition-colors">
                  Save as New Version
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "credentials" && (
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100">Store Credentials</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-sm text-slate-300">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <img src={iosIcon.src} alt="iOS" className="h-3.5 w-3.5 object-contain" />
                  App Store Connect
                </span>
                <span className="text-emerald-400">connected</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <img src={androidIcon.src} alt="Android" className="h-3.5 w-3.5 object-contain" />
                  Google Play
                </span>
                <span className="text-emerald-400">connected</span>
              </div>
              <div className="md:col-span-2 flex gap-2 justify-end">
                <Button className="bg-indigo-500 hover:bg-indigo-600">Update keys</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "compliance" && (
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100">Compliance & Preflight</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                <span>Privacy strings</span>
                <span className="text-emerald-400">ok</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                <span>Data safety</span>
                <span className="text-emerald-400">ok</span>
              </div>
              <div className="flex gap-2 justify-end">
                <Button className="bg-indigo-500 hover:bg-indigo-600">Run preflight</Button>
            </div>
          </CardContent>
        </Card>
        )}

        {tab === "releases" && (
          <div className="space-y-6">
        <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
          <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Rocket className="h-5 w-5" />
                  Current Release Status
                </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3 text-sm text-slate-300">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <img src={iosIcon.src} alt="iOS" className="h-3.5 w-3.5 object-contain" />
                    iOS status
                  </span>
              <span className="text-indigo-400">{app.ios.status}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <img src={androidIcon.src} alt="Android" className="h-3.5 w-3.5 object-contain" />
                    Android status
                  </span>
              <span className="text-pink-400">{app.android.status}</span>
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Button className="bg-indigo-500 hover:bg-indigo-600">Validate</Button>
              <Button className="bg-emerald-500 hover:bg-emerald-600">Submit</Button>
            </div>
          </CardContent>
        </Card>

            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Release History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <img src={iosIcon.src} alt="iOS" className="h-4 w-4 object-contain" />
                      <div>
                        <div className="text-sm font-medium text-slate-100">v1.2.0 (Build 61)</div>
                        <div className="text-xs text-slate-400">TestFlight Preview</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">2 hours ago</div>
                      <div className="text-xs text-blue-400">Preview</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <img src={androidIcon.src} alt="Android" className="h-4 w-4 object-contain" />
                      <div>
                        <div className="text-sm font-medium text-slate-100">v1.2.0 (Build 58)</div>
                        <div className="text-xs text-slate-400">Production</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">2 hours ago</div>
                      <div className="text-xs text-indigo-400">In Review</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <img src={iosIcon.src} alt="iOS" className="h-4 w-4 object-contain" />
                      <div>
                        <div className="text-sm font-medium text-slate-100">v1.1.0 (Build 45)</div>
                        <div className="text-xs text-slate-400">Production</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">1 week ago</div>
                      <div className="text-xs text-emerald-400">Live</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "integrations" && (
          <div className="space-y-6">
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  GitHub Actions Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <img src={iosIcon.src} alt="iOS" className="h-4 w-4 object-contain" />
                      <span className="text-sm font-medium text-slate-100">iOS Build</span>
                    </div>
                    <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">Connected</span>
                  </div>
                  <div className="text-xs text-slate-400 mb-3">
                    Automatically build and submit iOS apps from your GitHub repository
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                    <Button variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-sm">
                      View Workflow
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <img src={androidIcon.src} alt="Android" className="h-4 w-4 object-contain" />
                      <span className="text-sm font-medium text-slate-100">Android Build</span>
                    </div>
                    <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">Connected</span>
                  </div>
                  <div className="text-xs text-slate-400 mb-3">
                    Automatically build and submit Android apps from your GitHub repository
                  </div>
                  <div className="flex gap-2">
                    <Button className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                    <Button variant="outline" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-sm">
                      View Workflow
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Build Triggers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">Push to main</div>
                        <div className="text-xs text-slate-400">Automatically build on every push to main branch</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-emerald-400">Active</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">Release tags</div>
                        <div className="text-xs text-slate-400">Build when creating release tags (v1.0.0)</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Inactive</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">Pull requests</div>
                        <div className="text-xs text-slate-400">Build on pull request creation</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Inactive</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Rocket className="h-5 w-5" />
                  Recent Builds
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">Build #42 - iOS</div>
                        <div className="text-xs text-slate-400">Commit: a1b2c3d - &ldquo;Update app metadata&quot;</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">2 hours ago</div>
                      <div className="text-xs text-emerald-400">Success</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-pink-400"></div>
                      <div>
                        <div className="text-sm font-medium text-slate-100">Build #41 - Android</div>
                        <div className="text-xs text-slate-400">Commit: e4f5g6h - &quot;Fix build configuration&quot;</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">4 hours ago</div>
                      <div className="text-xs text-pink-400">Failed</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "history" && (
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <History className="h-5 w-5" />
                Activity History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2"></div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-100">App metadata updated</div>
                    <div className="text-xs text-slate-400">Title and description modified for both platforms</div>
                    <div className="text-xs text-slate-500">2 hours ago</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2"></div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-100">iOS build submitted</div>
                    <div className="text-xs text-slate-400">v1.2.0 (Build 61) submitted to TestFlight</div>
                    <div className="text-xs text-slate-500">6 hours ago</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <div className="w-2 h-2 rounded-full bg-pink-400 mt-2"></div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-100">Android build rejected</div>
                    <div className="text-xs text-slate-400">v1.2.0 (Build 58) rejected - Metadata guidelines</div>
                    <div className="text-xs text-slate-500">1 day ago</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-2"></div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-100">Screenshots uploaded</div>
                    <div className="text-xs text-slate-400">Added iPhone 6.7&quot; screenshots for 3 locales</div>
                    <div className="text-xs text-slate-500">2 days ago</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
    </main>
  );
}


