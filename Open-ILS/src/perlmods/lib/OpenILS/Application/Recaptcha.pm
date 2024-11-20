# ------------------------------------------------------------------------------
# Module:       OpenILS::Application::Recaptcha
# Author:       Ian Skelskey <ianskelskey@gmail.com>
# Organization: Bibliomation, Inc.
# Year:         2024
# Description:  This module implements the reCAPTCHA v3 verification process within
#               the Evergreen ILS, as an OpenSRF service, using Google's reCAPTCHA 
#               API to validate user input.
# ------------------------------------------------------------------------------

package OpenILS::Application::Recaptcha;

use strict;
use warnings;
use base 'OpenSRF::Application';
use LWP::UserAgent;
use JSON;
use OpenSRF::Utils::Logger qw($logger);
use OpenILS::Utils::CStoreEditor;

# Register the OpenSRF method
__PACKAGE__->register_method(
    method => 'recaptcha_verify',
    api_name => 'biblio.recaptcha.verify',
    argc => 1,  # Expecting one argument (a hash with token and org_unit)
    stream => 0 # It's not a streaming method
);

# Initialize CStore Editor
my $editor;
sub editor {
    return $editor ||= OpenILS::Utils::CStoreEditor->new;
}

sub get_secret_key {
    my ($org) = @_;

    my $U = 'OpenILS::Application::AppUtils';
    my $secret_key = $U->ou_ancestor_setting_value($org, 'recaptcha.secret_key');

    if ($secret_key) {
        $logger->info("Retrieved reCAPTCHA secret key for org ID $org");
        return $secret_key;
    }

    $logger->error("No reCAPTCHA secret key found for org ID $org");
    return undef;
}

# Verify the reCAPTCHA token
sub recaptcha_verify {
    my ($self, $client, $args) = @_;

    my $token = $args->{token};
    my $org_unit = $args->{org_unit} || 1; # Default to consortium (org_unit 1)

    $logger->info("Starting reCAPTCHA verification for org_unit: $org_unit");
    $logger->info("Received reCAPTCHA token: $token");

    # Send verification request to Google
    my $response = send_recaptcha_request($token, $org_unit);
    my $result = process_recaptcha_response($response);

    return encode_json($result);
}

# Send request to Google's reCAPTCHA API
sub send_recaptcha_request {
    my ($recaptcha_response, $org) = @_;

    my $secret = get_secret_key($org);
    unless ($secret) {
        $logger->error("reCAPTCHA secret key not found for organization ID: $org");
        return { success => 0, error => 'reCAPTCHA secret key not found' };
    }

    my $url = 'https://www.google.com/recaptcha/api/siteverify';
    my $ua = LWP::UserAgent->new(timeout => 10);
    my $response = $ua->post($url, {
        secret   => $secret,
        response => $recaptcha_response
    });

    unless ($response->is_success) {
        $logger->error("Failed to reach Google reCAPTCHA server: " . $response->status_line);
        return { success => 0, error => 'Failed to reach reCAPTCHA server' };
    }

    $logger->info("Successfully sent reCAPTCHA verification request");
    return $response;
}

# Process the response from Google's reCAPTCHA API
sub process_recaptcha_response {
    my ($response) = @_;

    my $content = $response->decoded_content || '{}';
    my $json;
    eval {
        $json = decode_json($content);
    };
    if ($@) {
        $logger->error("Error decoding JSON response from Google: $@");
        return { success => 0, error => 'Invalid JSON response from Google' };
    }

    $logger->info("Decoded reCAPTCHA response: $content");

    unless ($json->{'success'}) {
        $logger->error("reCAPTCHA verification failed: " . join(", ", @{$json->{'error-codes'}}));
        return { success => 0, 'error-codes' => $json->{'error-codes'} };
    }

    if ($json->{'score'} < 0.5) {
        $logger->warn("reCAPTCHA score is below threshold: " . $json->{'score'});
        return { success => 0, error => 'reCAPTCHA score is below threshold' };
    }

    $logger->info("reCAPTCHA verified successfully with score: " . $json->{'score'});
    return { success => 1 };
}

1;
