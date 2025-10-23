"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Link as LinkIcon, 
  Sparkles, 
  Shield, 
  Image, 
  CheckCircle, 
  Rocket,
  ArrowRight,
  ArrowLeft,
  FileText,
  Key,
  Globe,
  Camera,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Download,
  Eye,
  Settings
} from "lucide-react";
import androidIcon from "../../../android.png";
import iosIcon from "../../../ios.png";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface BuildInfo {
  name: string;
  version: string;
  buildNumber: string;
  platform: "ios" | "android" | "both";
  packageId?: string;
  bundleId?: string;
  iconUrl?: string;
  fileSize: string;
}

interface StoreCredentials {
  googlePlay: {
    connected: boolean;
    accountEmail?: string;
    permissions?: string[];
  };
  appStore: {
    connected: boolean;
    issuerId?: string;
    keyId?: string;
  };
}

interface GeneratedContent {
  title: string;
  subtitle: string;
  shortDescription: string;
  longDescription: string;
  keywords: string[];
  category: string;
  ageRating: string;
  promotionalText?: string;
  dataSafetyDescription?: string;
}

interface ScreenshotSet {
  platform: "ios" | "android";
  device: string;
  count: number;
  generated: boolean;
  uploaded: boolean;
}

interface ValidationResult {
  field: string;
  status: "pass" | "warning" | "error";
  message: string;
  suggestion?: string;
}

export default function AddAppPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = React.useState<Step>(1);
  const [isLoading, setIsLoading] = React.useState(false);
  
  // Step 1: Upload Build
  const [buildFile, setBuildFile] = React.useState<File | null>(null);
  const [buildInfo, setBuildInfo] = React.useState<BuildInfo | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  
  // Step 2: Store Credentials
  const [credentials, setCredentials] = React.useState<StoreCredentials>({
    googlePlay: { connected: false },
    appStore: { connected: false }
  });
  
  // Step 3: Generated Content
  const [generatedContent, setGeneratedContent] = React.useState<GeneratedContent | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  
  // Step 4: Privacy & Support
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = React.useState("");
  const [supportUrl, setSupportUrl] = React.useState("");
  const [isGeneratingPrivacy, setIsGeneratingPrivacy] = React.useState(false);
  
  // Step 5: Screenshots
  const [screenshots, setScreenshots] = React.useState<ScreenshotSet[]>([
    { platform: "ios", device: "iPhone 6.7\"", count: 3, generated: false, uploaded: false },
    { platform: "ios", device: "iPhone 6.5\"", count: 3, generated: false, uploaded: false },
    { platform: "ios", device: "iPad Pro 12.9\"", count: 3, generated: false, uploaded: false },
    { platform: "android", device: "Phone", count: 2, generated: false, uploaded: false },
    { platform: "android", device: "7-inch tablet", count: 1, generated: false, uploaded: false },
    { platform: "android", device: "10-inch tablet", count: 1, generated: false, uploaded: false }
  ]);
  const [isGeneratingScreenshots, setIsGeneratingScreenshots] = React.useState(false);
  
  // Step 6: Pre-Release Check
  const [validationResults, setValidationResults] = React.useState<ValidationResult[]>([]);
  const [isValidating, setIsValidating] = React.useState(false);
  
  // Step 7: Submit
  const [submissionStatus, setSubmissionStatus] = React.useState<"ready" | "submitting" | "submitted" | "error">("ready");
  const [showSuccessDialog, setShowSuccessDialog] = React.useState(false);

  const steps = [
    { number: 1, title: "Upload Build", icon: Upload, description: "Drop your exported file" },
    { number: 2, title: "Connect Stores", icon: LinkIcon, description: "Link publishing accounts" },
    { number: 3, title: "Auto-Generate", icon: Sparkles, description: "AI prepares your listings" },
    { number: 4, title: "Privacy & Support", icon: Shield, description: "Generate compliance pages" },
    { number: 5, title: "Screenshots", icon: Image, description: "AI creates device mockups" },
    { number: 6, title: "Pre-Release Check", icon: CheckCircle, description: "Validate everything" },
    { number: 7, title: "Submit", icon: Rocket, description: "Ship to both stores" }
  ];

  const handleFileUpload = async (file: File) => {
    setBuildFile(file);
    setIsAnalyzing(true);
    
    // Simulate AI analysis
    setTimeout(() => {
      const mockInfo: BuildInfo = {
        name: "Travelly",
        version: "1.2.0",
        buildNumber: "58",
        platform: file.name.includes('.ipa') ? 'ios' : 'android',
        packageId: file.name.includes('.ipa') ? undefined : 'com.travelly.app',
        bundleId: file.name.includes('.ipa') ? 'com.travelly.app' : undefined,
        fileSize: `${(file.size / 1024 / 1024).toFixed(1)} MB`
      };
      setBuildInfo(mockInfo);
      setIsAnalyzing(false);
    }, 2000);
  };

  const handleGenerateContent = async () => {
    setIsGenerating(true);
    
    // Simulate AI content generation
    setTimeout(() => {
      const mockContent: GeneratedContent = {
        title: "Travelly",
        subtitle: "Discover amazing places",
        shortDescription: "Your ultimate travel companion with AI-powered recommendations",
        longDescription: "Travelly is your ultimate travel companion. Find the best destinations, book flights and hotels, and create unforgettable memories. With our AI-powered recommendations, you'll discover hidden gems and plan the perfect itinerary for any adventure.",
        keywords: ["travel", "booking", "hotels", "flights", "vacation", "trip planning"],
        category: "Travel",
        ageRating: "4+",
        promotionalText: "Discover amazing places and plan your perfect trip with AI-powered recommendations",
        dataSafetyDescription: "This app collects location data to provide personalized travel recommendations"
      };
      setGeneratedContent(mockContent);
      setIsGenerating(false);
    }, 3000);
  };

  const handleGeneratePrivacy = async () => {
    setIsGeneratingPrivacy(true);
    
    // Simulate privacy policy generation
    setTimeout(() => {
      setPrivacyPolicyUrl("https://larkx.app/privacy/travelly");
      setSupportUrl("https://larkx.app/support/travelly");
      setIsGeneratingPrivacy(false);
    }, 2000);
  };

  const handleGenerateScreenshots = async () => {
    setIsGeneratingScreenshots(true);
    
    // Simulate screenshot generation
    setTimeout(() => {
      setScreenshots(prev => prev.map(s => ({ ...s, generated: true })));
      setIsGeneratingScreenshots(false);
    }, 4000);
  };

  const handleRegenerateScreenshot = (index: number) => {
    setScreenshots(prev => prev.map((s, i) => 
      i === index ? { ...s, generated: false } : s
    ));
    // Simulate regeneration
    setTimeout(() => {
      setScreenshots(prev => prev.map((s, i) => 
        i === index ? { ...s, generated: true } : s
      ));
    }, 2000);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    
    // Simulate validation
    setTimeout(() => {
      const mockResults: ValidationResult[] = [
        { field: "App Title", status: "pass", message: "Title is within character limits" },
        { field: "Screenshots", status: "pass", message: "All required screenshots are present" },
        { field: "Privacy Policy", status: "pass", message: "Privacy policy URL is valid" },
        { field: "Store Credentials", status: "warning", message: "Google Play credentials expire in 30 days", suggestion: "Update your service account key" },
        { field: "Age Rating", status: "error", message: "Age rating mismatch between platforms", suggestion: "iOS shows 4+ but Android shows Everyone" }
      ];
      setValidationResults(mockResults);
      setIsValidating(false);
    }, 2000);
  };

  const handleFixAgeRating = () => {
    // Simulate fixing the age rating issue
    const updatedResults = validationResults.map(result => 
      result.field === "Age Rating" 
        ? { ...result, status: "pass" as const, message: "Age rating is now consistent across platforms" }
        : result
    );
    setValidationResults(updatedResults);
  };

  const handleSubmit = async () => {
    setSubmissionStatus("submitting");
    
    // Simulate submission
    setTimeout(() => {
      setSubmissionStatus("submitted");
      setShowSuccessDialog(true);
    }, 3000);
  };

  const canProceed = (step: Step): boolean => {
    switch (step) {
      case 1: return buildInfo !== null;
      case 2: return credentials.googlePlay.connected && credentials.appStore.connected;
      case 3: return generatedContent !== null;
      case 4: return privacyPolicyUrl !== "" && supportUrl !== "";
      case 5: return screenshots.every(s => s.generated || s.uploaded);
      case 6: return validationResults.length > 0 && validationResults.every(r => r.status !== "error");
      case 7: return submissionStatus === "ready";
      default: return false;
    }
  };

  const nextStep = () => {
    if (currentStep < 7 && canProceed(currentStep)) {
      setCurrentStep((currentStep + 1) as Step);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  return (
    <main className="min-h-screen text-slate-100">
      <div className="w-full">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Add New App</h1>
              <p className="text-slate-400">AI-assisted app publishing in 7 simple steps</p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => router.push("/apps")}
              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            >
              Cancel
            </Button>
          </div>

          {/* Progress Steps */}
          <div className="mb-6">
            <div className="flex items-center justify-between overflow-x-auto pb-4">
              {steps.map((step, index) => {
                const isActive = currentStep === step.number;
                const isCompleted = currentStep > step.number;
                const Icon = step.icon;
                
                return (
                  <div key={step.number} className="flex items-center flex-shrink-0">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors min-w-0 ${
                      isActive 
                        ? "bg-indigo-500/20 border border-indigo-400/30" 
                        : isCompleted 
                          ? "bg-emerald-500/20 border border-emerald-400/30" 
                          : "bg-white/5 border border-white/10"
                    }`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isActive 
                          ? "bg-indigo-500 text-white" 
                          : isCompleted 
                            ? "bg-emerald-500 text-white" 
                            : "bg-white/10 text-slate-400"
                      }`}>
                        {isCompleted ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                      </div>
                      <div className="text-xs min-w-0">
                        <div className={`font-medium truncate ${isActive ? "text-indigo-300" : isCompleted ? "text-emerald-300" : "text-slate-300"}`}>
                          {step.title}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{step.description}</div>
                      </div>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`w-4 h-0.5 mx-2 flex-shrink-0 ${isCompleted ? "bg-emerald-400" : "bg-white/10"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Content */}
          <div className="space-y-6">
            {/* Step 1: Upload Build */}
            {currentStep === 1 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Upload Your Build File
                  </CardTitle>
                  <p className="text-slate-400">Drop your exported file or connect your builder</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!buildFile ? (
                    <div className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center hover:border-indigo-400/50 transition-colors">
                      <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-100 mb-2">Drop your build file here</h3>
                      <p className="text-slate-400 mb-4">
                        Supports .aab, .apk, .ipa files or zipped FlutterFlow exports
                      </p>
                      <input
                        type="file"
                        accept=".aab,.apk,.ipa,.zip"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        className="hidden"
                        id="build-upload"
                      />
                      <label
                        htmlFor="build-upload"
                        className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg cursor-pointer transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        Choose File
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {isAnalyzing ? (
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-indigo-500/10 border border-indigo-400/30">
                          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                          <span className="text-indigo-300">🧠 AI is analyzing your build file...</span>
                        </div>
                      ) : buildInfo && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30">
                            <Check className="w-5 h-5 text-emerald-400" />
                            <span className="text-emerald-300">Build file analyzed successfully!</span>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                              <h4 className="font-medium text-slate-100 mb-3">App Information</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Name:</span>
                                  <span className="text-slate-200">{buildInfo.name}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Version:</span>
                                  <span className="text-slate-200">{buildInfo.version}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Build:</span>
                                  <span className="text-slate-200">{buildInfo.buildNumber}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Size:</span>
                                  <span className="text-slate-200">{buildInfo.fileSize}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                              <h4 className="font-medium text-slate-100 mb-3">Platform Details</h4>
                              <div className="space-y-2 text-sm">
                                {buildInfo.platform === 'ios' && (
                                  <div className="flex items-center gap-2">
                                    <img src={iosIcon.src} alt="iOS" className="w-4 h-4" />
                                    <span className="text-slate-200">iOS App</span>
                                  </div>
                                )}
                                {buildInfo.platform === 'android' && (
                                  <div className="flex items-center gap-2">
                                    <img src={androidIcon.src} alt="Android" className="w-4 h-4" />
                                    <span className="text-slate-200">Android App</span>
                                  </div>
                                )}
                                {buildInfo.bundleId && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Bundle ID:</span>
                                    <span className="text-slate-200 font-mono text-xs">{buildInfo.bundleId}</span>
                                  </div>
                                )}
                                {buildInfo.packageId && (
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Package ID:</span>
                                    <span className="text-slate-200 font-mono text-xs">{buildInfo.packageId}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 2: Connect Store Accounts */}
            {currentStep === 2 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <LinkIcon className="h-5 w-5" />
                    Connect Store Accounts
                  </CardTitle>
                  <p className="text-slate-400">Link your publishing accounts securely</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Google Play */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <img src={androidIcon.src} alt="Android" className="w-6 h-6" />
                        <h3 className="text-lg font-medium text-slate-100">Google Play Console</h3>
                      </div>
                      
                      {credentials.googlePlay.connected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Check className="w-4 h-4" />
                            <span className="text-sm">Connected</span>
                          </div>
                          <div className="text-sm text-slate-400">
                            Account: {credentials.googlePlay.accountEmail}
                          </div>
                          <div className="text-xs text-slate-500">
                            Permissions: {credentials.googlePlay.permissions?.join(", ")}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                          >
                            Update Credentials
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-sm text-slate-400">
                            Connect using OAuth or upload Service Account JSON
                          </div>
                          <div className="space-y-2">
                            <Button 
                              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
                              onClick={() => setCredentials(prev => ({
                                ...prev,
                                googlePlay: { 
                                  connected: true, 
                                  accountEmail: "developer@example.com",
                                  permissions: ["Release management", "App management"]
                                }
                              }))}
                            >
                              <Key className="w-4 h-4 mr-2" />
                              Connect with OAuth
                            </Button>
                            <Button 
                              variant="outline" 
                              className="w-full border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Upload Service Account
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* App Store Connect */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <img src={iosIcon.src} alt="iOS" className="w-6 h-6" />
                        <h3 className="text-lg font-medium text-slate-100">App Store Connect</h3>
                      </div>
                      
                      {credentials.appStore.connected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Check className="w-4 h-4" />
                            <span className="text-sm">Connected</span>
                          </div>
                          <div className="text-sm text-slate-400">
                            Issuer ID: {credentials.appStore.issuerId}
                          </div>
                          <div className="text-sm text-slate-400">
                            Key ID: {credentials.appStore.keyId}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                          >
                            Update Keys
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-sm text-slate-400">
                            Upload your API key (Issuer ID, Key ID, Private Key)
                          </div>
                          <div className="space-y-3">
                            <Input 
                              placeholder="Issuer ID" 
                              className="bg-slate-900/60 border-white/10 text-slate-100"
                            />
                            <Input 
                              placeholder="Key ID" 
                              className="bg-slate-900/60 border-white/10 text-slate-100"
                            />
                            <div>
                              <label className="block text-sm text-slate-300 mb-2">Private Key (.p8 file)</label>
                              <input
                                type="file"
                                accept=".p8"
                                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-white/5 file:text-slate-300 hover:file:bg-white/10"
                              />
                            </div>
                            <Button 
                              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
                              onClick={() => setCredentials(prev => ({
                                ...prev,
                                appStore: { 
                                  connected: true, 
                                  issuerId: "12345678-1234-1234-1234-123456789012",
                                  keyId: "ABC123DEF4"
                                }
                              }))}
                            >
                              <Key className="w-4 h-4 mr-2" />
                              Connect Account
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-300 mb-1">Secure Storage</h4>
                        <p className="text-sm text-blue-200/80">
                          All credentials are encrypted and stored securely. We never store your private keys in plain text.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Auto-Generate Metadata */}
            {currentStep === 3 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Auto-Generate Metadata
                  </CardTitle>
                  <p className="text-slate-400">We'll prepare your store listings with AI</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!generatedContent ? (
                    <div className="text-center py-8">
                      <Sparkles className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                      <h3 className="text-xl font-medium text-slate-100 mb-2">Ready to generate content?</h3>
                      <p className="text-slate-400 mb-6">
                        Our AI will analyze your app and create optimized store listings
                      </p>
                      <Button 
                        onClick={handleGenerateContent}
                        disabled={isGenerating}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Content
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30">
                        <Check className="w-5 h-5 text-emerald-400" />
                        <span className="text-emerald-300">Content generated successfully!</span>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        {/* iOS Content */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <img src={iosIcon.src} alt="iOS" className="w-5 h-5" />
                            <h4 className="font-medium text-slate-100">iOS App Store</h4>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">App Title</label>
                              <Input 
                                value={generatedContent.title}
                                className="bg-slate-900/60 border-white/10 text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">Subtitle</label>
                              <Input 
                                value={generatedContent.subtitle}
                                className="bg-slate-900/60 border-white/10 text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">Promotional Text</label>
                              <Input 
                                value={generatedContent.promotionalText}
                                className="bg-slate-900/60 border-white/10 text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">Keywords</label>
                              <div className="flex flex-wrap gap-1">
                                {generatedContent.keywords.map((keyword, index) => (
                                  <Badge key={index} className="bg-indigo-500/20 text-indigo-300 border-indigo-400/30">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Android Content */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-4">
                            <img src={androidIcon.src} alt="Android" className="w-5 h-5" />
                            <h4 className="font-medium text-slate-100">Google Play Store</h4>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">App Title</label>
                              <Input 
                                value={generatedContent.title}
                                className="bg-slate-900/60 border-white/10 text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">Short Description</label>
                              <Input 
                                value={generatedContent.shortDescription}
                                className="bg-slate-900/60 border-white/10 text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-slate-300 mb-1">Data Safety Description</label>
                              <Input 
                                value={generatedContent.dataSafetyDescription}
                                className="bg-slate-900/60 border-white/10 text-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm text-slate-300 mb-1">Long Description</label>
                          <textarea 
                            value={generatedContent.longDescription}
                            className="w-full h-24 bg-slate-900/60 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 resize-none"
                          />
                        </div>
                        <div className="grid md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-sm text-slate-300 mb-1">Category</label>
                            <Input 
                              value={generatedContent.category}
                              className="bg-slate-900/60 border-white/10 text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-slate-300 mb-1">Age Rating</label>
                            <Input 
                              value={generatedContent.ageRating}
                              className="bg-slate-900/60 border-white/10 text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-slate-300 mb-1">Keywords</label>
                            <Input 
                              value={generatedContent.keywords.join(", ")}
                              className="bg-slate-900/60 border-white/10 text-slate-100"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 4: Privacy & Support Setup */}
            {currentStep === 4 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Privacy & Support Setup
                  </CardTitle>
                  <p className="text-slate-400">We'll generate and host your compliance pages</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Privacy Policy */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <FileText className="w-5 h-5 text-indigo-400" />
                        <h3 className="text-lg font-medium text-slate-100">Privacy Policy</h3>
                      </div>
                      
                      {privacyPolicyUrl ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Check className="w-4 h-4" />
                            <span className="text-sm">Generated</span>
                          </div>
                          <div className="text-sm text-slate-400">
                            URL: <span className="text-slate-200 font-mono">{privacyPolicyUrl}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Preview
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-sm text-slate-400">
                            AI will generate a privacy policy based on your app's data collection practices
                          </div>
                          <Button 
                            onClick={handleGeneratePrivacy}
                            disabled={isGeneratingPrivacy}
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
                          >
                            {isGeneratingPrivacy ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Generate Privacy Policy
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Support URL */}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Globe className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-medium text-slate-100">Support Page</h3>
                      </div>
                      
                      {supportUrl ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-emerald-400">
                            <Check className="w-4 h-4" />
                            <span className="text-sm">Created</span>
                          </div>
                          <div className="text-sm text-slate-400">
                            URL: <span className="text-slate-200 font-mono">{supportUrl}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Preview
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                            >
                              <Settings className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-sm text-slate-400">
                            We'll create a support page with contact information and FAQ
                          </div>
                          <Button 
                            onClick={handleGeneratePrivacy}
                            disabled={isGeneratingPrivacy}
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white"
                          >
                            {isGeneratingPrivacy ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Create Support Page
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-300 mb-1">AI-Powered Compliance</h4>
                        <p className="text-sm text-blue-200/80">
                          Our AI analyzes your app's SDKs and data collection to generate compliant privacy policies and data safety descriptions.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: Screenshots */}
            {currentStep === 5 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Screenshots
                  </CardTitle>
                  <p className="text-slate-400">No designer? No problem. AI creates device mockups</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* iOS Screenshots */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <img src={iosIcon.src} alt="iOS" className="w-5 h-5" />
                        <h4 className="font-medium text-slate-100">iOS Screenshots</h4>
                      </div>
                      
                      <div className="space-y-3">
                        {screenshots.filter(s => s.platform === 'ios').map((screenshot, index) => (
                          <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                screenshot.generated || screenshot.uploaded 
                                  ? "bg-emerald-500 text-white" 
                                  : "bg-white/10 text-slate-400"
                              }`}>
                                {screenshot.generated || screenshot.uploaded ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Camera className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-slate-100">{screenshot.device}</div>
                                <div className="text-xs text-slate-400">{screenshot.count} screenshots required</div>
                                {screenshot.generated && (
                                  <div className="text-xs text-emerald-400 mt-1">✓ Generated</div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {screenshot.generated ? (
                                <>
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    Preview
                                  </Button>
                                  <Button 
                                    size="sm"
                                    onClick={() => handleRegenerateScreenshot(index)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white"
                                  >
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Change
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                                  >
                                    Upload
                                  </Button>
                                  <Button 
                                    size="sm"
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white"
                                  >
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Generate
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Android Screenshots */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <img src={androidIcon.src} alt="Android" className="w-5 h-5" />
                        <h4 className="font-medium text-slate-100">Android Screenshots</h4>
                      </div>
                      
                      <div className="space-y-3">
                        {screenshots.filter(s => s.platform === 'android').map((screenshot, index) => (
                          <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                screenshot.generated || screenshot.uploaded 
                                  ? "bg-emerald-500 text-white" 
                                  : "bg-white/10 text-slate-400"
                              }`}>
                                {screenshot.generated || screenshot.uploaded ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Camera className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-slate-100">{screenshot.device}</div>
                                <div className="text-xs text-slate-400">{screenshot.count} screenshots required</div>
                                {screenshot.generated && (
                                  <div className="text-xs text-emerald-400 mt-1">✓ Generated</div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {screenshot.generated ? (
                                <>
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    Preview
                                  </Button>
                                  <Button 
                                    size="sm"
                                    onClick={() => handleRegenerateScreenshot(index)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white"
                                  >
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Change
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                                  >
                                    Upload
                                  </Button>
                                  <Button 
                                    size="sm"
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white"
                                  >
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Generate
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-center">
                    <Button 
                      onClick={handleGenerateScreenshots}
                      disabled={isGeneratingScreenshots}
                      className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3"
                    >
                      {isGeneratingScreenshots ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating All Screenshots...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate All Screenshots
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-300 mb-1">AI Screenshot Generation</h4>
                        <p className="text-sm text-blue-200/80">
                          Our AI creates realistic device mockups with your app's interface, optimized for each store's requirements.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 6: Pre-Release Check */}
            {currentStep === 6 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Pre-Release Check
                  </CardTitle>
                  <p className="text-slate-400">Before we submit, let's check everything</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {validationResults.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                      <h3 className="text-xl font-medium text-slate-100 mb-2">Ready to validate?</h3>
                      <p className="text-slate-400 mb-6">
                        We'll check for common issues and predict possible rejection reasons
                      </p>
                      <Button 
                        onClick={handleValidate}
                        disabled={isValidating}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Run Validation
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-400/30">
                        <Check className="w-5 h-5 text-emerald-400" />
                        <span className="text-emerald-300">Validation complete!</span>
                      </div>

                      <div className="space-y-3">
                        {validationResults.map((result, index) => (
                          <div key={index} className="flex items-start gap-3 p-4 rounded-lg border border-white/10 bg-white/5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                              result.status === "pass" 
                                ? "bg-emerald-500 text-white" 
                                : result.status === "warning"
                                  ? "bg-amber-500 text-white"
                                  : "bg-red-500 text-white"
                            }`}>
                              {result.status === "pass" ? (
                                <Check className="w-3 h-3" />
                              ) : result.status === "warning" ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-100">{result.field}</span>
                                <Badge className={
                                  result.status === "pass" 
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
                                    : result.status === "warning"
                                      ? "bg-amber-500/20 text-amber-300 border-amber-400/30"
                                      : "bg-red-500/20 text-red-300 border-red-400/30"
                                }>
                                  {result.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-300 mb-1">{result.message}</p>
                              {result.suggestion && (
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-slate-400">
                                    💡 {result.suggestion}
                                  </p>
                                  {result.field === "Age Rating" && result.status === "error" && (
                                    <Button 
                                      size="sm"
                                      onClick={handleFixAgeRating}
                                      className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-1"
                                    >
                                      <Sparkles className="w-3 h-3 mr-1" />
                                      Auto-fix
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-blue-300 mb-1">AI-Powered Validation</h4>
                            <p className="text-sm text-blue-200/80">
                              Our AI analyzes your submission against store guidelines and past rejection patterns to catch issues before submission.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 7: Submit */}
            {currentStep === 7 && (
              <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    Submit to Stores
                  </CardTitle>
                  <p className="text-slate-400">Ready to ship? Submit to both stores</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {submissionStatus === "ready" && (
                    <div className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <img src={iosIcon.src} alt="iOS" className="w-6 h-6" />
                            <h3 className="text-lg font-medium text-slate-100">App Store Connect</h3>
                          </div>
                          <div className="space-y-2 text-sm text-slate-400">
                            <div>• Submit to TestFlight for testing</div>
                            <div>• Submit to App Store Review</div>
                            <div>• Track submission status</div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <img src={androidIcon.src} alt="Android" className="w-6 h-6" />
                            <h3 className="text-lg font-medium text-slate-100">Google Play Console</h3>
                          </div>
                          <div className="space-y-2 text-sm text-slate-400">
                            <div>• Submit to Internal Testing</div>
                            <div>• Submit to Production</div>
                            <div>• Track release status</div>
                          </div>
                        </div>
                      </div>

                      <div className="text-center">
                        <Button 
                          onClick={handleSubmit}
                          className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3 text-lg"
                        >
                          <Rocket className="w-5 h-5 mr-2" />
                          Submit to Both Stores
                        </Button>
                      </div>
                    </div>
                  )}

                  {submissionStatus === "submitting" && (
                    <div className="text-center py-8">
                      <Loader2 className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-spin" />
                      <h3 className="text-xl font-medium text-slate-100 mb-2">Submitting to stores...</h3>
                      <p className="text-slate-400">
                        This may take a few minutes. We&apos;ll notify you when it&apos;s complete.
                      </p>
                    </div>
                  )}

                  {submissionStatus === "submitted" && (
                    <div className="text-center py-8">
                      <Check className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                      <h3 className="text-xl font-medium text-slate-100 mb-2">Successfully submitted!</h3>
                      <p className="text-slate-400 mb-6">
                        Your app has been submitted to both stores. You&apos;ll receive updates on the review process.
                      </p>
                      <div className="flex gap-3 justify-center">
                        <Button 
                          onClick={() => router.push("/apps")}
                          className="bg-indigo-500 hover:bg-indigo-600 text-white"
                        >
                          View Apps
                        </Button>
                        <Button 
                          variant="outline"
                          className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                        >
                          Track Status
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {currentStep > 1 && (
              <Button 
                onClick={prevStep}
                variant="outline"
                className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>
            )}
            {currentStep === 1 && <div />}

            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Step {currentStep} of 7</span>
              <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${(currentStep / 7) * 100}%` }}
                />
              </div>
            </div>

            <Button 
              onClick={nextStep}
              disabled={!canProceed(currentStep) || currentStep === 7}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
            >
              {currentStep === 7 ? "Complete" : "Next"}
              {currentStep < 7 && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900/95 backdrop-blur border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-400" />
                App Successfully Submitted!
              </h2>
              <button
                onClick={() => setShowSuccessDialog(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Rocket className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-100 mb-2">Your app is on its way!</h3>
                <p className="text-slate-400">
                  We've successfully submitted your app to both App Store and Google Play. 
                  You'll receive updates on the review process.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={iosIcon.src} alt="iOS" className="w-5 h-5" />
                    <h4 className="font-medium text-slate-100">iOS App Store</h4>
                  </div>
                  <div className="space-y-2 text-sm text-slate-400">
                    <div>• Submitted to TestFlight</div>
                    <div>• Review time: 24-48 hours</div>
                    <div>• Status: In Review</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={androidIcon.src} alt="Android" className="w-5 h-5" />
                    <h4 className="font-medium text-slate-100">Google Play</h4>
                  </div>
                  <div className="space-y-2 text-sm text-slate-400">
                    <div>• Submitted to Production</div>
                    <div>• Review time: 1-3 days</div>
                    <div>• Status: In Review</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-400/20 bg-blue-400/10 p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-300 mb-1">What's Next?</h4>
                    <p className="text-sm text-blue-200/80">
                      We'll monitor your submissions and notify you of any updates. 
                      If there are any issues, our AI will help you fix them automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/10">
              <Button
                onClick={() => {
                  setShowSuccessDialog(false);
                  router.push("/apps");
                }}
                variant="outline"
                className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                Close
              </Button>
              <Button 
                onClick={() => {
                  setShowSuccessDialog(false);
                  router.push("/apps");
                }}
                className="bg-indigo-500 hover:bg-indigo-600 text-white"
              >
                View Apps Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}