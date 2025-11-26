terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Optional: Uncomment to use remote state (recommended for production)
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "larkx/terraform.tfstate"
  #   region = "us-east-1"
  #   encrypt = true
  # }
}

